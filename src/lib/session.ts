// ============================================================
// Gen3ia — Session shim (compatibilité)
// ============================================================
//  Les sessions sont désormais gérées par Firebase Auth via session cookies.
//  Ce fichier préserve les imports legacy `import { ... } from '@/lib/session'`.
// ============================================================

import { cookies } from 'next/headers';
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

export default getServerSession;
