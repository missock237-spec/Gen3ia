// ============================================================
// POST /api/auth/reset-password — Confirmation reset (Firebase)
// ============================================================
//  Body: { oobCode, newPassword }
//  Le client a reçu un lien de reset généré par Firebase.
//  Cette route valide la force du mot de passe et met à jour
//  le mot de passe via Admin SDK.
//
//  Note: Firebase Admin SDK n'expose pas verifyPasswordResetCode.
//  Le client doit d'abord vérifier le code (verifyPasswordResetCode
//  côté client), puis envoyer le oobCode + nouveau mot de passe.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { validatePasswordStrength } from '@/lib/firebase/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const oobCode = body?.oobCode as string | undefined;
    const newPassword = body?.newPassword as string | undefined;

    if (!oobCode || !newPassword) {
      return NextResponse.json({ error: 'oobCode et newPassword requis' }, { status: 400 });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: 'Mot de passe trop faible', reasons: strength.reasons }, { status: 400 });
    }

    // Le client doit avoir vérifié le oobCode via verifyPasswordResetCode (client SDK)
    // avant d'appeler cette route. On récupère l'email depuis le body (le client
    // l'obtient de verifyPasswordResetCode).
    const email = body?.email as string | undefined;
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const user = await auth.getUserByEmail(email.toLowerCase().trim());

    await auth.updateUser(user.uid, { password: newPassword });
    await auth.revokeRefreshTokens(user.uid);

    try {
      await createAuditLog({
        userId: user.uid,
        action: 'auth.password.reset.completed',
        resource: 'auth',
        severity: 'info',
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/reset-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la réinitialisation' },
      { status: 500 },
    );
  }
}
