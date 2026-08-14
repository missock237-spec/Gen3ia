// ============================================================
// POST /api/auth/forgot-password — Demande de reset (Firebase)
// ============================================================
//  Body: { email }
//  Génère un lien Firebase password reset et envoie l'email via Resend.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { sendPasswordResetEmail } from '@/lib/firebase/auth';
import { getUserByEmail } from '@/lib/firebase/auth';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = body?.email as string | undefined;
    if (!email) return NextResponse.json({ error: 'Email manquant' }, { status: 400 });

    // On vérifie d'abord si l'utilisateur existe (anti-énumération : on réponds OK dans tous les cas)
    const user = await getUserByEmail(email);
    if (user) {
      await sendPasswordResetEmail(email, {
        url: `${APP_URL}/reset-password`,
        handleCodeInApp: true,
      });
      await createAuditLog({
        userId: user.uid,
        action: 'auth.password.reset.requested',
        resource: 'auth',
        severity: 'info',
      });
    }

    // Toujours répondre OK (anti-énumération)
    return NextResponse.json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
    });
  } catch (error) {
    console.error('[auth/forgot-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
