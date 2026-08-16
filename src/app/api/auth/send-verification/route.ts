// ============================================================
// POST /api/auth/send-verification — Envoie l'email de vérification
// ============================================================
//  Body: {} (utilise la session courante)
// ============================================================

import { NextResponse } from 'next/server';

import { getServerSession, sendEmailVerificationLink } from '@/lib/firebase/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    await sendEmailVerificationLink(session.user.id, {
      url: `${APP_URL}/dashboard`,
      handleCodeInApp: true,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/send-verification] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
