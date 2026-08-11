// ============================================================
// Gen3ia — Auth shim (compatibilité)
// ============================================================
//  Préserve l'API historique :
//    - import { hashPassword, verifyPassword } from '@/lib/auth'
//    - import { getServerSession } from '@/lib/auth'
//    - import { verifyAccessToken } from '@/lib/auth'
//    - import { createAuditLog, generateResetToken } from '@/lib/auth'
//
//  Backend : Firebase Authentication (server-side) via Admin SDK.
//
//  hashPassword/verifyPassword ne sont plus utilisés : Firebase Auth
//  gère le hachage (scrypt configurable). On expose des no-ops /
//  helpers qui lèvent une erreur explicite si appelés directement.
// ============================================================

export {
  getServerSession,
  getCurrentUser,
  verifyIdToken,
  verifyAccessToken,
  createSessionCookie,
  setSessionCookie,
  clearSessionCookie,
  getSessionCookie,
  createUser,
  getUserByUid,
  getUserByEmail,
  updateUser,
  setUserRole,
  deleteUser,
  revokeAllSessions,
  sendPasswordResetEmail,
  sendEmailVerificationLink,
  validatePasswordStrength,
  createAuditLog,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
  type Gen3iaUser,
  type ServerSession,
  type AccessTokenPayload,
} from '@/lib/firebase/auth';

// ============================================================
// Legacy helpers — dépréciés (Firebase Auth gère en interne)
// ============================================================

/**
 * @deprecated Firebase Auth gère le hachage des mots de passe (scrypt).
 * Cette fonction n'a plus d'effet. Conservée uniquement pour compat
 * avec d'éventuels imports résiduels.
 */
export async function hashPassword(_password: string): Promise<string> {
  throw new Error(
    '[auth] hashPassword() est déprécié — Firebase Auth gère le hachage côté serveur. ' +
    'Utilisez createUser() ou signInWithEmailAndPassword côté client.',
  );
}

/**
 * @deprecated Firebase Auth gère la vérification côté serveur.
 */
export async function verifyPassword(_hash: string, _password: string): Promise<boolean> {
  throw new Error(
    '[auth] verifyPassword() est déprécié — Firebase Auth vérifie le mot de passe via signInWithEmailAndPassword.',
  );
}

/**
 * Génère un token aléatoire (utilisé pour des identifiants non-Firebase,
 * ex: tokens d'invitation, tokens API). Conservé car non spécifique à l'auth.
 */
export function generateSessionToken(): string {
  return require('node:crypto').randomBytes(48).toString('hex');
}

export function generateResetToken(): string {
  return require('node:crypto').randomBytes(32).toString('hex');
}

export async function hashToken(token: string): Promise<string> {
  const crypto = await import('node:crypto');
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(token, salt, 100_000, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`pbkdf2:sha256:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}
