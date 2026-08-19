// ============================================================
// POST /api/auth/login — Firebase Authentication
// ============================================================
//  Body: { idToken: string, rememberMe?: boolean }
//  Flow :
//    1. Le client appelle signInWithEmailAndPassword (Firebase Client SDK)
//       ou signInWithPopup (Google/GitHub) -> obtient un idToken.
//    2. POST cette route avec l'idToken -> le serveur :
//       a. vérifie l'idToken via Admin SDK (verifyIdToken)
//       b. crée le session cookie Firebase (httpOnly, 14 jours)
//       c. upsert le profil étendu dans Firestore (miroir de Firebase Auth)
//       d. renvoie l'utilisateur normalisé { id, email, name, plan, role, ... }
//  Side-effect: positionne le cookie `gen3ia_session` (httpOnly, 14 jours).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookie, verifyIdToken } from '@/lib/firebase/auth';
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

    // 1. Vérifie l'idToken côté serveur (Admin SDK) et récupère l'utilisateur.
    //    verifyIdToken fait 3 tentatives avec retry + délai cold start.
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/login] verifyIdToken returned null for token length:', idToken?.length);
      return NextResponse.json(
        { error: 'Session invalide. Veuillez réessayer.' },
        { status: 401 },
      );
    }

    // 2. Positionne le cookie de session Firebase (httpOnly, 14 jours).
    //    Indépendant du résultat du upsert Firestore ci-dessous.
    await setSessionCookie(idToken);

    // 3. Synchronise le profil Firestore (miroir étendu de Firebase Auth).
    //    - Si l'utilisateur existe déjà (re-login), on met à jour les champs
    //      volatiles (lastActiveAt, avatar, emailVerified).
    //    - Sinon on crée le profil (utile pour les OAuth first-login qui
    //      passent par /api/auth/login au lieu de /api/auth/register).
    const now = new Date();
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'Utilisateur';
    try {
      await db.user.upsert({
        where: { id: user.uid },
        create: {
          id: user.uid,
          uid: user.uid,
          email: user.email || '',
          name: fallbackName,
          avatar: user.photoURL || null,
          emailVerified: user.emailVerified,
          plan: 'free',
          role: (user.customClaims?.role as string) || 'user',
          credits: 0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
        },
        update: {
          email: user.email || '',
          name: user.displayName || undefined,
          avatar: user.photoURL || undefined,
          emailVerified: user.emailVerified,
          lastActiveAt: now,
          updatedAt: now,
        },
      });
    } catch (upsertErr) {
      // Le login ne doit pas échouer si Firestore est indisponible.
      // Le cookie de session est déjà posé ; l'utilisateur est authentifié.
      console.error('[auth/login] Firestore upsert failed (non-fatal):', upsertErr);
    }

    // 4. Récupère le profil étendu pour renvoyer `plan`/`credits`/`isActive`.
    let profile: Record<string, unknown> | null = null;
    try {
      profile = await db.user.findUnique({ where: { id: user.uid } }) as Record<string, unknown> | null;
    } catch (profileErr) {
      console.error('[auth/login] profile fetch failed (non-fatal):', profileErr);
    }

    // 5. Réponse normalisée — doit inclure tous les champs attendus par le
    //    client (LoginForm) : id, email, name, plan, role, avatar, emailVerified.
    return NextResponse.json({
      user: {
        id: user.uid,
        uid: user.uid,
        email: user.email || '',
        name: (profile?.name as string) || user.displayName || fallbackName,
        avatar: (profile?.avatar as string | null) || user.photoURL || null,
        picture: user.photoURL || null,
        emailVerified: user.emailVerified,
        isEmailVerified: user.emailVerified,
        role: (user.customClaims?.role as string) || (profile?.role as string) || 'user',
        plan: (profile?.plan as string) || 'free',
        credits: (profile?.credits as number) || 0,
        isActive: (profile?.isActive as boolean) ?? true,
        isCreator: (profile?.isCreator as boolean) ?? false,
      },
    });
  } catch (error) {
    console.error('[auth/login] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur d\'authentification' },
      { status: 500 },
    );
  }
}
