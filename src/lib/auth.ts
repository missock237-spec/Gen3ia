// ============================================================
// AUTH — Hachage et verification des mots de passe
// Utilise argon2id (recommandation OWASP 2026)
// ============================================================

import * as argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
  saltLength: 16,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

// ============================================================
// Session token generation
// ============================================================

import crypto from 'crypto';

export function generateSessionToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

// ============================================================
// Audit log — records security-relevant events
// ============================================================

export async function createAuditLog(params: {
  userId: string;
  action: string;
  resource?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity?: string;
}): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource || 'unknown',
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        severity: params.severity || 'info',
      },
    });
  } catch (error) {
    console.error('[audit-log] Failed to create audit log:', error instanceof Error ? error.message : String(error));
  }
}

// ============================================================
// Server session — get current session from NextAuth
// ============================================================

export async function getServerSession(): Promise<{
  user: { id: string; email: string; name: string; role: string };
} | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { getServerSession: nextAuthGetSession } = await import('next-auth/next');
    const session = await nextAuthGetSession();
    if (!session?.user?.email) return null;
    
    const { db } = await import('@/lib/db');
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true, role: true },
    });
    
    if (!user) return null;
    return { user };
  } catch {
    return null;
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < 8) reasons.push("Minimum 8 caractères");
  if (!/[A-Z]/.test(password)) reasons.push("Au moins une majuscule");
  if (!/[a-z]/.test(password)) reasons.push("Au moins une minuscule");
  if (!/[0-9]/.test(password)) reasons.push("Au moins un chiffre");
  // Minimum 12 pour validation complete, 8 pour compatibilite inscription
  return { valid: password.length >= 8 && reasons.length <= 1, reasons };
}

// ============================================================
// Re-exports from @/lib/auth/jwt
// ============================================================

export { verifyAccessToken, type AccessTokenPayload } from '@/lib/auth/jwt';

// ============================================================
// Token generation utilities
// ============================================================

/**
 * Generate a random token for email verification / password reset
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using PBKDF2 (for secure storage in DB)
 */
export async function hashToken(token: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(token, salt, 100_000, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`pbkdf2:sha256:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}
