// ============================================================
// Tests — JWT Service (signAccessToken, signRefreshToken,
// verifyAccessToken, verifyRefreshToken, rotateRefreshToken,
// logoutToken, invalidateAllUserTokens, tokenBlacklist)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn().mockRejectedValue(new Error('No Redis')), // Fallback mémoire
    setex: vi.fn(),
    exists: vi.fn(),
  })),
}));

const TEST_SECRET = 'test-secret-key-32-characters-minimum!!';
const testUser = { id: 'user_1', email: 'test@gen3ia.ai', role: 'user' };

describe('JWT Service - Sécurité des tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = TEST_SECRET;
  });

  describe('1. Access Token (15 min)', () => {
    it('signe un access token valide', async () => {
      const { signAccessToken } = await import('@/lib/auth/jwt');
      const token = await signAccessToken(testUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // JWT a 3 parties
      expect(token.split('.')).toHaveLength(3);
    });

    it('contient les claims requis (sub, email, role, jti, type)', async () => {
      const { signAccessToken, verifyAccessToken } = await import('@/lib/auth/jwt');
      const token = await signAccessToken(testUser);
      const decoded = await verifyAccessToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.sub).toBe('user_1');
      expect(decoded!.email).toBe('test@gen3ia.ai');
      expect(decoded!.role).toBe('user');
      expect(decoded!.type).toBe('access');
      expect(decoded!.jti).toBeDefined();
      expect(decoded!.jti.length).toBeGreaterThan(10);
    });

    it('a un jti unique à chaque appel', async () => {
      const { signAccessToken, verifyAccessToken } = await import('@/lib/auth/jwt');
      const token1 = await signAccessToken(testUser);
      const token2 = await signAccessToken(testUser);
      const decoded1 = await verifyAccessToken(token1);
      const decoded2 = await verifyAccessToken(token2);
      expect(decoded1!.jti).not.toBe(decoded2!.jti);
    });

    it('rejette un token modifié (tampering)', async () => {
      const { signAccessToken, verifyAccessToken } = await import('@/lib/auth/jwt');
      const token = await signAccessToken(testUser);
      const parts = token.split('.');
      const tampered = `${parts[0]}.${parts[1]}xxx.${parts[2]}`;
      const result = await verifyAccessToken(tampered);
      expect(result).toBeNull();
    });

    it('rejette un token expiré', async () => {
      const { verifyAccessToken } = await import('@/lib/auth/jwt');
      // Token avec exp dans le passé
      const { SignJWT, base64url } = await import('jose');
      const { createSecretKey } = await import('node:crypto');
      
      const secretKey = createSecretKey(new TextEncoder().encode(TEST_SECRET));
      const expiredToken = await new SignJWT({
        sub: 'user_1', email: 'test@test.com', role: 'user',
        jti: 'test-jti', type: 'access',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Date.now() / 1000 - 3600) // 1h dans le passé
        .setExpirationTime('0s') // Déjà expiré
        .setIssuer('gen3ia')
        .sign(secretKey);

      const result = await verifyAccessToken(expiredToken);
      expect(result).toBeNull();
    });
  });

  describe('2. Refresh Token (7 jours avec rotation)', () => {
    it('signe un refresh token valide', async () => {
      const { signRefreshToken, verifyRefreshToken } = await import('@/lib/auth/jwt');
      const token = await signRefreshToken('user_1');
      expect(token.split('.')).toHaveLength(3);
      const decoded = await verifyRefreshToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.sub).toBe('user_1');
      expect(decoded!.type).toBe('refresh');
      expect(decoded!.jti).toBeDefined();
      expect(decoded!.tokenVersion).toBe(1);
    });

    it('rejette un refresh token avec blacklist', async () => {
      const { signRefreshToken, verifyRefreshToken, tokenBlacklist } = await import('@/lib/auth/jwt');
      const token = await signRefreshToken('user_1');
      
      // Simuler la blacklist du jti
      const decoded = await verifyRefreshToken(token);
      await tokenBlacklist.add(decoded!.jti, new Date(Date.now() + 3600000));

      const result = await verifyRefreshToken(token);
      expect(result).toBeNull();
    });
  });

  describe('3. Rotation des tokens', () => {
    it('effectue une rotation complète (ancien blacklisté, nouveaux tokens)', async () => {
      const { signRefreshToken, rotateRefreshToken, verifyAccessToken, verifyRefreshToken } = await import('@/lib/auth/jwt');
      const { prisma } = await import('@/lib/prisma');

      (prisma.session.findFirst as any).mockResolvedValue({
        id: 'session_1',
        userId: 'user_1',
        expiresAt: new Date(Date.now() + 86400000),
      });
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user_1', email: 'test@test.com', role: 'user' });
      (prisma.session.update as any).mockResolvedValue({ id: 'session_1' });

      const oldToken = await signRefreshToken('user_1');

      const result = await rotateRefreshToken(oldToken);
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeDefined();
      expect(result!.newRefreshToken).toBeDefined();
      expect(result!.userId).toBe('user_1');

      // L'ancien token doit être blacklisté
      const oldValid = await verifyRefreshToken(oldToken);
      expect(oldValid).toBeNull();

      // Les nouveaux tokens doivent être valides
      const newAccess = await verifyAccessToken(result!.accessToken);
      expect(newAccess).not.toBeNull();
      const newRefresh = await verifyRefreshToken(result!.newRefreshToken);
      expect(newRefresh).not.toBeNull();
    });

    it('retourne null si refresh token invalide', async () => {
      const { rotateRefreshToken } = await import('@/lib/auth/jwt');
      const result = await rotateRefreshToken('invalid-token');
      expect(result).toBeNull();
    });

    it('retourne null si session expirée', async () => {
      const { signRefreshToken, rotateRefreshToken } = await import('@/lib/auth/jwt');
      const { prisma } = await import('@/lib/prisma');

      (prisma.session.findFirst as any).mockResolvedValue(null); // Pas de session

      const token = await signRefreshToken('user_1');
      const result = await rotateRefreshToken(token);
      expect(result).toBeNull();
    });
  });

  describe('4. Logout et invalidation', () => {
    it('blackliste le token au logout', async () => {
      const { signRefreshToken, logoutToken, verifyRefreshToken } = await import('@/lib/auth/jwt');
      const token = await signRefreshToken('user_1');
      
      await logoutToken(token);

      // Le token doit être blacklisté
      const result = await verifyRefreshToken(token);
      expect(result).toBeNull();
    });

    it('supprime toutes les sessions utilisateur', async () => {
      const { invalidateAllUserTokens } = await import('@/lib/auth/jwt');
      const { prisma } = await import('@/lib/prisma');

      (prisma.session.deleteMany as any).mockResolvedValue({ count: 3 });

      await invalidateAllUserTokens('user_1');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
      });
    });
  });

  describe('5. Blacklist (mémoire + Redis fallback)', () => {
    it('ajoute et vérifie un jti dans la blacklist', async () => {
      const { tokenBlacklist } = await import('@/lib/auth/jwt');
      await tokenBlacklist.add('test-jti', new Date(Date.now() + 60000));
      expect(await tokenBlacklist.has('test-jti')).toBe(true);
    });

    it('ne trouve pas un jti non blacklisté', async () => {
      const { tokenBlacklist } = await import('@/lib/auth/jwt');
      expect(await tokenBlacklist.has('non-existent-jti')).toBe(false);
    });

    it('nettoie les entrées expirées', async () => {
      const { tokenBlacklist } = await import('@/lib/auth/jwt');
      // Ajouter avec expiration immédiate
      await tokenBlacklist.add('expired-jti', new Date(Date.now() - 1000));
      // Vérifier que ça a été ignoré (ttl <= 0)
      expect(await tokenBlacklist.has('expired-jti')).toBe(false);
    });
  });

  describe('6. Cycle de vie complet', () => {
    it('login → refresh → logout (cycle complet)', async () => {
      const { prisma } = await import('@/lib/prisma');
      (prisma.session.findFirst as any).mockResolvedValue({
        id: 'session_1', userId: 'user_1', expiresAt: new Date(Date.now() + 86400000),
      });
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'user_1', email: 'test@test.com', role: 'user' });
      (prisma.session.update as any).mockResolvedValue({ id: 'session_1' });
      (prisma.session.deleteMany as any).mockResolvedValue({ count: 1 });

      const { signAccessToken, signRefreshToken, verifyAccessToken, rotateRefreshToken, logoutToken } = await import('@/lib/auth/jwt');

      // 1. Login: signer les tokens
      const access = await signAccessToken({ id: 'user_1', email: 'test@test.com', role: 'user' });
      const refresh = await signRefreshToken('user_1');
      expect(access).toBeDefined();
      expect(refresh).toBeDefined();

      // 2. Vérifier l'access token
      const verified = await verifyAccessToken(access);
      expect(verified).not.toBeNull();
      expect(verified!.sub).toBe('user_1');

      // 3. Refresh avec rotation
      const rotated = await rotateRefreshToken(refresh);
      expect(rotated).not.toBeNull();
      expect(rotated!.accessToken).not.toBe(access); // Nouvel access token
      expect(rotated!.newRefreshToken).not.toBe(refresh); // Nouveau refresh token

      // 4. L'ancien refresh token ne doit plus fonctionner
      const oldRefreshValid = await verifyRefreshToken(refresh);
      expect(oldRefreshValid).toBeNull();

      // 5. Nouvel access token doit fonctionner
      const newAccessValid = await verifyAccessToken(rotated!.accessToken);
      expect(newAccessValid).not.toBeNull();

      // 6. Logout
      await logoutToken(rotated!.newRefreshToken);
      const loggedOutRefresh = await verifyRefreshToken(rotated!.newRefreshToken);
      expect(loggedOutRefresh).toBeNull();
    });
  });

  describe('7. Vérification du middleware security.ts', () => {
    beforeEach(() => {
      process.env.AUTH_SECRET = TEST_SECRET;
    });

    it('authentifie un utilisateur avec un access token valide', async () => {
      const { applySecurity } = await import('@/lib/security');
      const { signAccessToken } = await import('@/lib/auth/jwt');
      const token = await signAccessToken(testUser);

      const request = new Request('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      }) as any;

      const { auth, error } = await applySecurity(request, { requireAuth: true });
      expect(error).toBeUndefined();
      expect(auth).toBeDefined();
      expect(auth!.userId).toBe('user_1');
      expect(auth!.role).toBe('user');
    });

    it('refuse une requête sans token si requireAuth=true', async () => {
      const { applySecurity } = await import('@/lib/security');

      const request = new Request('http://localhost/api/test') as any;
      const { error } = await applySecurity(request, { requireAuth: true });
      expect(error).toBeDefined();
      expect(error!.status).toBe(401);
    });
  });
});
