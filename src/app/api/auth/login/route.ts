// ============================================================
// POST /api/auth/login — Firebase Authentication
// ============================================================
//  Body: { idToken: string, rememberMe?: boolean }
//  Flow :
//    1. Le client appelle signInWithEmailAndPassword (Firebase Client SDK)
//       ou signInWithPopup (Google/GitHub) -> obtient un idToken.
//    2. POST cette route avec l'idToken -> le serveur :
//       a. verifie l'idToken via Admin SDK (verifyIdToken)
//       b. verifie que le profil Firestore existe (seuls les inscrits)
//       c. cree le session cookie Firebase (httpOnly, 14 jours)
//       d. met a jour les champs volatils dans Firestore
//       e. renvoie l'utilisateur normalise { id, email, name, plan, role, ... }
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

    // 1. Verifie l'idToken cote serveur (Admin SDK) et recupere l'utilisateur.
    //    verifyIdToken fait 3 tentatives avec retry + delai cold start.
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/login] verifyIdToken returned null for token length:', idToken?.length);
      return NextResponse.json(
        { error: 'Session invalide. Veuillez reessayer.' },
        { status: 401 },
      );
    }

    // 2. Verifie que l'utilisateur existe dans la base Firestore.
    //    Seuls les utilisateurs reellement inscrits (passes par /register
    //    ou crees par l'admin) peuvent se connecter.
    const now = new Date();
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'Utilisateur';
    let profile: Record<string, unknown> | null = null;
    try {
      profile = await db.user.findUnique({ where: { id: user.uid } }) as Record<string, unknown> | null;
    } catch (profileErr) {
      console.error('[auth/login] profile fetch failed:', profileErr);
    }

    if (!profile) {
      console.warn('[auth/login] No Firestore profile for:', user.uid, user.email);
      return NextResponse.json(
        { error: 'Aucun compte trouve. Veuillez creer un compte avant de vous connecter.' },
        { status: 403 },
      );
    }

    // Verifie que le compte est actif
    if (profile.isActive === false) {
      return NextResponse.json(
        { error: 'Ce compte a ete desactive. Contactez le support.' },
        { status: 403 },
      );
    }

    // 3. Positionne le cookie de session Firebase (httpOnly, 14 jours).
    //    Try/catch dedie : si createSessionCookie echoue, on renvoie
    //    une erreur claire au lieu d'un 500 generique.
    try {
      await setSessionCookie(idToken);
    } catch (cookieErr) {
      const msg = cookieErr instanceof Error ? cookieErr.message : String(cookieErr);
      console.error('[auth/login] setSessionCookie failed:', msg);
      return NextResponse.json(
        { error: 'Erreur de session. Veuillez reessayer.' },
        { status: 503 },
      );
    }

    // 4. Met a jour les champs volatils (lastActiveAt, avatar, emailVerified).
    try {
      await db.user.update({
        where: { id: user.uid },
        data: {
          email: user.email || '',
          name: user.displayName || undefined,
          avatar: user.photoURL || undefined,
          emailVerified: user.emailVerified,
          lastActiveAt: now,
          updatedAt: now,
        },
      });
    } catch (updateErr) {
      console.error('[auth/login] Firestore update failed (non-fatal):', updateErr);
    }

    // 5. Reponse normalisee — doit inclure tous les champs attendus par le
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
      { error: error instanceof Error ? error.message : "Erreur d'authentification" },
      { status: 500 },
    );
  }
}
