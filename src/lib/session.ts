// ============================================================
// Gen3ia — Session shim (compatibilité)
// ============================================================
//  Les sessions sont désormais gérées par Firebase Auth via session cookies.
//  Ce fichier préserve les imports legacy `import { ... } from '@/lib/session'`.
// ============================================================

import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { getServerSession, getSessionCookie, SESSION_COOKIE_NAME } from '@/lib/firebase/auth';

export {
  getServerSession,
  getSessionCookie,
  SESSION_COOKIE_NAME,
};

/**
 * @deprecated Utiliser getServerSession() directement.
 * Récupère l'ID utilisateur courant (uid Firebase Auth).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession();
  return session?.user.id ?? null;
}

/**
 * Vérifie si l'utilisateur courant est admin.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession();
  return session?.user.role === 'admin';
}

/**
 * Legacy alias for getServerSession — returns the authenticated user.
 */
export async function getAuthenticatedUser(): Promise<{ user?: { id: string; email: string; role: string } } | null> {
  return getServerSession();
}

// ============================================================
// Legacy JWT / refresh-token shims
// ============================================================
//  Firebase Auth session cookies are NOT split into access/refresh:
//  the cookie IS the session, is set server-side, and is rotated by
//  re-authentication. These shims allow legacy API routes
//  (/api/auth/refresh, /api/auth/sessions, etc.) that still import
//  `extractToken` / `extractRefreshToken` / `refreshSession` /
//  `refreshSessionCookie` to compile and respond gracefully (401 /
//  no-op) instead of breaking the build.
// ============================================================

/**
 * @deprecated Extract the bearer/session token from a request, for
 * legacy routes that need to identify the current session.
 * Returns the Firebase session cookie value when present, otherwise
 * the `Authorization: Bearer <token>` header value, otherwise null.
 */
export function extractToken(request: NextRequest): string | null {
  const authHeader =
    request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (match) return match[1].trim();
  }
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * @deprecated Firebase session cookies are not split into access/refresh.
 * Returns whatever legacy refresh cookie the client may still carry,
 * or null. Used by /api/auth/refresh to detect legacy clients.
 */
export function extractRefreshToken(request: NextRequest): string | null {
  return (
    request.cookies.get('gen3ia_refresh_token')?.value ??
    request.cookies.get('refresh_token')?.value ??
    null
  );
}

/**
 * @deprecated No Firebase equivalent — clients must re-authenticate
 * to rotate the session cookie. Always returns null so legacy
 * /api/auth/refresh routes respond with 401 "invalid or expired
 * refresh token".
 */
export async function refreshSession(
  _refreshToken: string
): Promise<{ token: string; refreshToken: string } | null> {
  return null;
}

/**
 * @deprecated No-op under Firebase session cookies — the session
 * cookie is set server-side via setSessionCookie() in
 * `@/lib/firebase/auth`. Kept for legacy signature compatibility.
 */
export function refreshSessionCookie(
  _response: NextResponse,
  _token?: string,
  _refreshToken?: string
): void {
  // intentional no-op
}

export default getServerSession;
