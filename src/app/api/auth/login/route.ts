// ============================================================
// POST /api/auth/login — Firebase Authentication
// ============================================================
//  Body: { idToken: string }  (obtenu côté client via signInWithEmailAndPassword)
//  Réponse: { user, sessionCookie }
//  Side-effect: positionne le cookie `gen3ia_session` (httpOnly, 14 jours).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookie, getUserByUid } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    if (!idToken) {
      return NextResponse.json({ error: 'idToken manquant' }, { status: 400 });
    }

    // Positionne le cookie de session Firebase
    await setSessionCookie(idToken);

    // Récupère l'utilisateur Firebase
    const user = await getUserByUid(
      // On décode l'uid du token via le session cookie fraîchement créé
// @ts-ignore
      (await import('@/lib/firebase/admin')).getAdminAuth().verifySessionCookie(
        ((await (await import('next/headers')).cookies()).get('gen3ia_session'))?.value || '',
        true,
      ).then((d) => d.uid),
    );

    // Synchronise le profil Firestore (miroir étendu de Firebase Auth)
    if (user) {
      await db.user.upsert({
        where: { id: user.uid },
        create: {
          uid: user.uid,
          email: user.email || '',
          name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
          avatar: user.photoURL || null,
          emailVerified: user.emailVerified,
          plan: 'free',
          role: (user.customClaims?.role as string) || 'user',
          credits: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActiveAt: new Date(),
        },
        update: {
          email: user.email || '',
          name: user.displayName || undefined,
          avatar: user.photoURL || undefined,
          emailVerified: user.emailVerified,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      user: user
        ? {
            id: user.uid,
            uid: user.uid,
            email: user.email,
            name: user.displayName,
            picture: user.photoURL,
            emailVerified: user.emailVerified,
            role: (user.customClaims?.role as string) || 'user',
          }
        : null,
    });
  } catch (error) {
    console.error('[auth/login] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur d\'authentification' },
      { status: 500 },
    );
  }
}
