// ============================================================
// Gen3ia — Firebase Authentication layer
// ============================================================
//  Remplace :
//    - src/lib/auth.ts (argon2 password hashing)
//    - src/lib/auth.config.ts (NextAuth config)
//    - src/lib/auth/jwt.ts (JWT service)
//    - src/lib/auth/auth.ts, src/lib/auth/security.ts
//    - src/lib/twofa.ts, src/lib/session.ts
//
//  Firebase Auth gère désormais :
//    - Création de comptes (email/password, Google, GitHub, etc.)
//    - Hachage sécurisé des mots de passe (scrypt, configurable)
//    - Vérification d'email (actionCodeSettings)
//    - Reset password, change password
//    - 2FA / MFA (TOTP via Firebase Admin)
//    - Sessions via session cookies (SSR-friendly)
//    - JWT verify (ID tokens) via Admin SDK
// ============================================================

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

import { getAdminAuth } from './admin';
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
} from './config';

// ============================================================
// Types publics
// ============================================================

export interface Gen3iaUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  disabled: boolean;
  providerData: { providerId: string; uid: string }[];
  customClaims?: Record<string, unknown>;
}

export interface ServerSession {
  user: {
    id: string;
    uid: string;
    email: string;
    name: string;
    role: string;
    picture?: string | null;
    emailVerified: boolean;
  };
}

// ============================================================
// Helpers de conversion
// ============================================================

function toGen3iaUser(fbUser: Awaited<ReturnType<ReturnType<typeof getAdminAuth>['getUser']>>): Gen3iaUser {
  return {
    uid: fbUser.uid,
// @ts-ignore
    email: fbUser.email,
    displayName: fbUser.displayName || null,
    photoURL: fbUser.photoURL || null,
    emailVerified: fbUser.emailVerified,
    disabled: fbUser.disabled,
    providerData: fbUser.providerData.map((p) => ({
      providerId: p.providerId,
      uid: p.uid,
    })),
    customClaims: (fbUser.customClaims || {}) as Record<string, unknown>,
  };
}

// ============================================================
// Session cookies (server-side)
// ============================================================

/**
 * Crée un session cookie Firebase à partir d'un ID token (client-side signIn).
 * À appeler dans une API route POST /api/auth/login après que le client
 * ait obtenu un ID token via signInWithEmailAndPassword.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  const auth = getAdminAuth();
  return auth.createSessionCookie(idToken, {
    expiresIn: SESSION_COOKIE_MAX_AGE * 1000,
  });
}

/**
 * Positionne le cookie de session dans la réponse HTTP.
 * À appeler côté serveur (API route).
 */
export async function setSessionCookie(idToken: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = await createSessionCookie(idToken);
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

/**
 * Invalide le cookie de session (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Récupère le session cookie depuis la requête (middleware).
 */
export function getSessionCookieFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Récupère le session cookie depuis next/headers (server component / API route).
 */
export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

// ============================================================
// Vérification de session (server-side)
// ============================================================

/**
 * Vérifie le session cookie courant et retourne l'utilisateur Firebase.
 * Retourne null si non authentifié ou session invalide.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const sessionCookie = await getSessionCookie();
    if (!sessionCookie) return null;

    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    const user = await auth.getUser(decoded.uid);

    const role = (user.customClaims?.role as string) || 'user';

    return {
      user: {
        id: user.uid,
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
        role,
        picture: user.photoURL || null,
        emailVerified: user.emailVerified,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Récupère l'utilisateur courant côté serveur (version simplifiée).
 */
export async function getCurrentUser(): Promise<Gen3iaUser | null> {
  try {
    const sessionCookie = await getSessionCookie();
    if (!sessionCookie) return null;
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    const user = await auth.getUser(decoded.uid);
    return toGen3iaUser(user);
  } catch {
    return null;
  }
}

/**
 * Vérifie un ID token Firebase (pour les appels client->API avec Authorization: Bearer).
 */
export async function verifyIdToken(idToken: string): Promise<Gen3iaUser | null> {
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    const user = await auth.getUser(decoded.uid);
    return toGen3iaUser(user);
  } catch {
    return null;
  }
}

// ============================================================
// Gestion des utilisateurs (côté serveur / admin)
// ============================================================

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string;
  photoURL?: string;
  emailVerified?: boolean;
  role?: string;
}

export async function createUser(input: CreateUserInput): Promise<Gen3iaUser> {
  const auth = getAdminAuth();
  const user = await auth.createUser({
    email: input.email.toLowerCase().trim(),
    password: input.password,
    displayName: input.displayName,
    photoURL: input.photoURL,
    emailVerified: input.emailVerified ?? false,
    disabled: false,
  });

  if (input.role && input.role !== 'user') {
    await auth.setCustomUserClaims(user.uid, { role: input.role });
  }

  return toGen3iaUser(
    await auth.getUser(user.uid),
  );
}

export async function getUserByUid(uid: string): Promise<Gen3iaUser | null> {
  try {
    const auth = getAdminAuth();
    return toGen3iaUser(await auth.getUser(uid));
  } catch {
    return null;
  }
}

export async function getUserByEmail(email: string): Promise<Gen3iaUser | null> {
  try {
    const auth = getAdminAuth();
    return toGen3iaUser(await auth.getUserByEmail(email.toLowerCase().trim()));
  } catch {
    return null;
  }
}

export async function updateUser(uid: string, patch: {
  displayName?: string;
  photoURL?: string;
  email?: string;
  password?: string;
  disabled?: boolean;
  emailVerified?: boolean;
}): Promise<Gen3iaUser> {
  const auth = getAdminAuth();
  await auth.updateUser(uid, patch);
  return toGen3iaUser(await auth.getUser(uid));
}

export async function setUserRole(uid: string, role: string): Promise<void> {
  const auth = getAdminAuth();
  const existing = await auth.getUser(uid);
  const claims = (existing.customClaims || {}) as Record<string, unknown>;
  await auth.setCustomUserClaims(uid, { ...claims, role });
}

export async function deleteUser(uid: string): Promise<void> {
  const auth = getAdminAuth();
  await auth.deleteUser(uid);
}

export async function revokeAllSessions(uid: string): Promise<void> {
  const auth = getAdminAuth();
  await auth.revokeRefreshTokens(uid);
}

// ============================================================
// Actions email (password reset, verification)
// ============================================================

export interface ActionCodeSettings {
  url: string;
  handleCodeInApp?: boolean;
  dynamicLinkDomain?: string;
  iOS?: { bundleId: string };
  android?: { packageName: string; installApp?: boolean; minimumVersion?: string };
}

export async function sendPasswordResetEmail(
  email: string,
  settings?: ActionCodeSettings,
): Promise<void> {
  const auth = getAdminAuth();
  const link = await auth.generatePasswordResetLink(email, settings);
  // L'envoi de l'email est délégué au module @/lib/email (Resend/SMTP)
// @ts-ignore
  const { sendPasswordResetEmail: sendEmail } = await import('@/lib/email/auth-emails');
  await sendEmail(email, link);
}

export async function sendEmailVerificationLink(
  uid: string,
  settings?: ActionCodeSettings,
): Promise<void> {
  const auth = getAdminAuth();
  const link = await auth.generateEmailVerificationLink(uid, settings);
  const user = await auth.getUser(uid);
  if (!user.email) throw new Error('Utilisateur sans email');
// @ts-ignore
  const { sendVerificationEmail } = await import('@/lib/email/auth-emails');
  await sendVerificationEmail(user.email, link);
}

// ============================================================
// Validation de la force du mot de passe (côté serveur, avant createUser)
// ============================================================

export function validatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < 8) reasons.push('Minimum 8 caractères');
  if (!/[A-Z]/.test(password)) reasons.push('Au moins une majuscule');
  if (!/[a-z]/.test(password)) reasons.push('Au moins une minuscule');
  if (!/[0-9]/.test(password)) reasons.push('Au moins un chiffre');
  return { valid: password.length >= 8 && reasons.length <= 1, reasons };
}

// ============================================================
// Audit log (délègue à Firestore)
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
    const { logEvent } = await import('./analytics');
    await logEvent({
      collection: 'audit_logs',
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource || 'unknown',
        details: params.details || {},
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        severity: params.severity || 'info',
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[audit-log] Failed:', error instanceof Error ? error.message : String(error));
  }
}

// ============================================================
// Alias pour compatibilité avec l'ancien import @/lib/auth/jwt
// ============================================================

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  uid: string;
  type: 'access';
  /** Prisma/legacy-compat alias for `sub`. */
  userId: string;
  /** Prisma/legacy-compat alias for `sub`. */
  id: string;
}

/**
 * Vérifie un access token Firebase (Bearer) et retourne un payload
 * compatible avec l'ancienne interface AccessTokenPayload.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  const user = await verifyIdToken(token);
  if (!user) return null;
  return {
    sub: user.uid,
    uid: user.uid,
    id: user.uid,
    userId: user.uid,
    email: user.email || '',
    role: (user.customClaims?.role as string) || 'user',
    type: 'access',
  };
}

export { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE } from './config';
