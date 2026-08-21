// ============================================================
// GET /api/auth/me — Retourne l'utilisateur courant (Firebase)
// ============================================================

import { NextResponse } from 'next/server';

import { getServerSession } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    // Récupère le profil étendu depuis Firestore
    let profile: any = null;
    let creditBalance = 0;

    try {
      profile = await db.user.findUnique({ where: { id: session.user.id } });
    } catch (e) {
      console.error('[auth/me] Profile fetch failed (non-fatal):', e);
    }

    // Récupère le solde de crédits
    try {
      const credit = await db.credit.findUnique({ where: { id: `credit_${session.user.id}` } });
      creditBalance = (credit as any)?.balance ?? (profile as any)?.credits ?? 0;
    } catch {}

    return NextResponse.json({
      user: {
        id: session.user.id,
        uid: session.user.uid,
        email: session.user.email,
        name: profile?.name || session.user.name,
        picture: session.user.picture || profile?.avatar,
        avatar: profile?.avatar,
        bio: profile?.bio,
        emailVerified: session.user.emailVerified,
        role: (profile as any)?.role || session.user.role || 'user',
        plan: (profile as any)?.plan || 'free',
        credits: creditBalance,
        isActive: (profile as any)?.isActive ?? true,
        isCreator: (profile as any)?.isCreator ?? false,
        language: (profile as any)?.language || 'fr',
        timezone: (profile as any)?.timezone || 'Africa/Douala',
        createdAt: (profile as any)?.createdAt,
        lastActiveAt: (profile as any)?.lastActiveAt,
      },
    });
  } catch (error) {
    console.error('[auth/me] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
