// ============================================================
// POST /api/auth/logout — Firebase Authentication
// ============================================================
//  Révoque les refresh tokens Firebase + supprime le cookie de session.
// ============================================================

import { NextResponse } from 'next/server';

import { clearSessionCookie, getSessionCookie, getServerSession } from '@/lib/firebase/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession();
    const cookieValue = await getSessionCookie();

    if (session && cookieValue) {
      // Révoque tous les refresh tokens de l'utilisateur (invalidation côté Firebase)
      try {
        const decoded = await getAdminAuth().verifySessionCookie(cookieValue, false);
        await getAdminAuth().revokeRefreshTokens(decoded.uid);
        await createAuditLog({
          userId: session.user.id,
          action: 'user.logout',
          resource: 'auth',
          severity: 'info',
        });
      } catch {
        // Non bloquant
      }
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/logout] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
