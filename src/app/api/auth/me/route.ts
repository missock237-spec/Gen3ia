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
      return NextResponse.json({ user: null }, { status: 200 });
    }

    // Récupère le profil étendu depuis Firestore
    const profile = await db.user.findUnique({ where: { id: session.user.id } });

    return NextResponse.json({
      user: {
        id: session.user.id,
        uid: session.user.uid,
        email: session.user.email,
        name: session.user.name,
        picture: session.user.picture,
        emailVerified: session.user.emailVerified,
        role: session.user.role,
        plan: (profile as Record<string, unknown>)?.plan || 'free',
        credits: (profile as Record<string, unknown>)?.credits || 0,
        isActive: (profile as Record<string, unknown>)?.isActive ?? true,
        isCreator: (profile as Record<string, unknown>)?.isCreator ?? false,
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
