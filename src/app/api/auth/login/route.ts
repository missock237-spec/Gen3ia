// ============================================================
// POST /api/auth/login — Firebase Authentication
// ============================================================
// Point d'entrée principal pour la connexion (email/password + OAuth).
// Le client Firebase obtient un idToken, l'envoie ici, le serveur
// le vérifie via Admin SDK et crée un cookie de session httpOnly.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookie, verifyIdToken } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UserProfile {
  id: string;
  name?: string | null;
  avatar?: string | null;
  role?: string;
  plan?: string;
  credits?: number;
  isActive?: boolean;
  isCreator?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    const rememberMe = body?.rememberMe as boolean | undefined;

    if (!idToken) {
      return NextResponse.json({ error: 'idToken manquant' }, { status: 400 });
    }

    // 1. Vérification du token Firebase Admin
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/login] verifyIdToken returned null for token length:', idToken?.length);
      return NextResponse.json(
        { error: 'Session invalide. Veuillez réessayer.' },
        { status: 401 },
      );
    }

    // 2. Récupération du profil Firestore
    const now = new Date();
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'Utilisateur';
    let profile: UserProfile | null = null;

    try {
      profile = (await db.user.findUnique({
        where: { id: user.uid },
      })) as UserProfile | null;
    } catch (profileErr) {
      console.error('[auth/login] profile fetch failed:', profileErr);
    }

    // 3. Vérification de l'existence du profil
    if (!profile) {
      return NextResponse.json(
        { error: 'Compte introuvable. Veuillez vous inscrire d\'abord.' },
        { status: 404 },
      );
    }

    // 4. Vérification de l'état du compte (Actif)
    if (profile.isActive === false) {
      return NextResponse.json(
        { error: 'Ce compte a été désactivé. Contactez le support.' },
        { status: 403 },
      );
    }

    // 5. Note: email verification is not blocking at login.
    //    Firebase already verifies the email/password combination.
    //    Unverified users can login and access the dashboard.
    //    Verification is encouraged via in-app banners.

    // 6. Création du cookie de session Firebase (14 jours)
    try {
      await setSessionCookie(idToken, rememberMe);
    } catch (cookieErr) {
      const msg = cookieErr instanceof Error ? cookieErr.message : String(cookieErr);
      console.error('[auth/login] setSessionCookie failed:', msg);
      return NextResponse.json(
        { error: 'Erreur de session. Veuillez réessayer.' },
        { status: 503 },
      );
    }

    // 7. Mise à jour des données utilisateur secondaires (non bloquant)
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

    // 8. Réponse client
    return NextResponse.json({
      user: {
        id: user.uid,
        uid: user.uid,
        email: user.email || '',
        name: profile.name || user.displayName || fallbackName,
        avatar: profile.avatar || user.photoURL || null,
        picture: user.photoURL || null,
        emailVerified: user.emailVerified,
        isEmailVerified: user.emailVerified,
        role: (user.customClaims?.role as string) || profile.role || 'user',
        plan: profile.plan || 'free',
        credits: profile.credits ?? 0,
        isActive: profile.isActive ?? true,
        isCreator: profile.isCreator ?? false,
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
