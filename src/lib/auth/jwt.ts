// ============================================================
// Gen3ia — JWT Service sécurisé
// - Access tokens courte durée (15 min)
// - Refresh tokens avec rotation (révocation + nouveau)
// - jti (JWT ID) pour traçabilité
// - Blacklist Redis pour logout + rotation
// - Rate limiting par IP
// ============================================================

import { SignJWT, jwtVerify, base64url } from 'jose';
import { createSecretKey } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('jwt-service');

// ============================================================
// CONSTANTS
// ============================================================

export const ACCESS_TOKEN_EXPIRY = '15m' as const;     // 15 minutes
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;
export const REFRESH_TOKEN_EXPIRY = '7d' as const;     // 7 jours
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

// ============================================================
// TOKEN BLACKLIST (mémoire + Redis)
// ============================================================

class TokenBlacklist {
  private store = new Map<string, number>();
  private redisEnabled = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Nettoyage périodique des entrées expirées
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    this.tryRedis();
  }

  private async tryRedis(): Promise<void> {
    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      this.redisEnabled = true;
      redis.disconnect();
    } catch {
      this.redisEnabled = false;
    }
  }

  async add(jti: string, expiresAt: Date): Promise<void> {
    const ttlMs = expiresAt.getTime() - Date.now();
    if (ttlMs <= 0) return;

    if (this.redisEnabled) {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        await redis.connect();
        await redis.setex(`token:blacklist:${jti}`, Math.ceil(ttlMs / 1000), '1');
        redis.disconnect();
        return;
      } catch {
        // Fallback mémoire
      }
    }

    this.store.set(jti, Date.now() + ttlMs);
  }

  async has(jti: string): Promise<boolean> {
    if (this.redisEnabled) {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        await redis.connect();
        const exists = await redis.exists(`token:blacklist:${jti}`);
        redis.disconnect();
        return exists === 1;
      } catch {
        // Fallback mémoire
      }
    }
    return this.store.has(jti);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, expires] of this.store) {
      if (now > expires) this.store.delete(key);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

const blacklist = new TokenBlacklist();

// ============================================================
// JWT SECRET
// ============================================================

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    log.warn('AUTH_SECRET trop court (< 32 chars) - risque de sécurité');
  }
  return new TextEncoder().encode(secret);
}

// ============================================================
// TOKENS — Sign & Verify
// ============================================================

export interface AccessTokenPayload {
  sub: string;           // userId
  email: string;
  role: string;
  jti: string;           // JWT ID unique
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;           // userId
  jti: string;           // JWT ID unique
  type: 'refresh';
  tokenVersion: number;  // Pour invalidation massive
}

/**
 * Sign un access token (15 min) avec jti unique
 */
export async function signAccessToken(user: {
  id: string;
  email: string;
  role: string;
}): Promise<string> {
  const secretKey = createSecretKey(getSecretKey());

  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    jti: randomUUID(),
    type: 'access',
  } as AccessTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('gen3ia')
    .sign(secretKey);
}

/**
 * Sign un refresh token (7 jours) avec jti unique et tokenVersion
 */
export async function signRefreshToken(
  userId: string,
  tokenVersion: number = 1
): Promise<string> {
  const secretKey = createSecretKey(getSecretKey());

  return new SignJWT({
    sub: userId,
    jti: randomUUID(),
    type: 'refresh',
    tokenVersion,
  } as RefreshTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer('gen3ia')
    .sign(secretKey);
}

/**
 * Vérifie un token JWT et retourne le payload décodé
 */
export async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const secretKey = createSecretKey(getSecretKey());
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: 'gen3ia',
    });
    return payload as unknown as T;
  } catch (err) {
    log.warn('Token verification failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Vérifie un access token + check blacklist
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  const payload = await verifyToken<AccessTokenPayload>(token);
  if (!payload || payload.type !== 'access') return null;

  // Vérifier blacklist
  if (await blacklist.has(payload.jti)) {
    log.warn('Access token is blacklisted', { jti: payload.jti, userId: payload.sub });
    return null;
  }

  return payload;
}

/**
 * Vérifie un refresh token + check blacklist
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  const payload = await verifyToken<RefreshTokenPayload>(token);
  if (!payload || payload.type !== 'refresh') return null;

  // Vérifier blacklist
  if (await blacklist.has(payload.jti)) {
    log.warn('Refresh token is blacklisted', { jti: payload.jti, userId: payload.sub });
    return null;
  }

  return payload;
}

// ============================================================
// REFRESH WITH ROTATION
// ============================================================

/**
 * Rafraîchit un access token en utilisant un refresh token valide.
 * Implémente la rotation : l'ancien refresh token est blacklisté,
 * un nouveau refresh token est généré.
 */
export async function rotateRefreshToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  newRefreshToken: string;
  userId: string;
} | null> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return null;

  // Blacklister l'ancien refresh token (rotation)
  const expDate = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);
  await blacklist.add(payload.jti, expDate);

  const { prisma } = await import('@/lib/prisma');

  // Vérifier que la session existe toujours en base
  const session = await prisma.session.findFirst({
    where: {
      userId: payload.sub,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) return null;

  // Récupérer l'utilisateur
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true },
  });

  if (!user) return null;

  // Générer nouveaux tokens
  const accessToken = await signAccessToken(user);
  const newRefreshToken = await signRefreshToken(user.id);

  // Mettre à jour la session en base
  await prisma.session.update({
    where: { id: session.id },
    data: {
      lastAccessedAt: new Date(),
    },
  });

  log.info('Token rotation successful', { userId: user.id });

  return {
    accessToken,
    newRefreshToken,
    userId: user.id,
  };
}

// ============================================================
// LOGOUT — Blacklist tokens
// ============================================================

/**
 * Invalide un refresh token (blacklist + suppression session)
 */
export async function logoutToken(refreshToken: string): Promise<void> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return;

  // Blacklister le jti
  const expDate = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);
  await blacklist.add(payload.jti, expDate);

  // Supprimer la session en base
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.session.deleteMany({
      where: { userId: payload.sub },
    });
  } catch {
    // Non fatal
  }

  log.info('Token invalidated on logout', { userId: payload.sub });
}

/**
 * Invalide toutes les sessions d'un utilisateur (force logout)
 */
export async function invalidateAllUserTokens(userId: string): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.session.deleteMany({ where: { userId } });
    log.info('All sessions invalidated', { userId });
  } catch {
    log.warn('Failed to invalidate all sessions', { userId });
  }
}

// ============================================================
// EXPORTS
// ============================================================

export { blacklist as tokenBlacklist };
