// ============================================================
// POST /api/auth/change-password — Changer le mot de passe (connecte)
// ============================================================
//  Body: { idToken, newPassword }
//  L'utilisateur est connecte et connait son mot de passe actuel.
//  Le client verifie le mot de passe actuel via signInWithEmailAndPassword,
//  puis envoie le nouvel idToken + nouveau mot de passe.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { verifyIdToken, validatePasswordStrength } from '@/lib/firebase/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    const newPassword = body?.newPassword as string | undefined;

    if (!idToken || !newPassword) {
      return NextResponse.json({ error: 'idToken et newPassword requis' }, { status: 400 });
    }

    // Valider la force du nouveau mot de passe
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json(
        { error: 'Mot de passe trop faible', reasons: strength.reasons },
        { status: 400 },
      );
    }

    // Verifier l'identite de l'utilisateur via le idToken
    const user = await verifyIdToken(idToken);
    if (!user) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
    }

    // Mettre a jour le mot de passe via Admin SDK
    const auth = getAdminAuth();
    await auth.updateUser(user.uid, { password: newPassword });

    // Revoquer les sessions existantes (force re-login)
    await auth.revokeRefreshTokens(user.uid);

    try {
      await createAuditLog({
        userId: user.uid,
        action: 'auth.password.changed',
        resource: 'auth',
        severity: 'info',
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/change-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors du changement de mot de passe' },
      { status: 500 },
    );
  }
}
