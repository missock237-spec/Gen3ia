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
import { createAuditLog } from '@/lib/firebase/analytics';

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
  const startTime = Date.now();
  let step = 'init';

  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    const rememberMe = body?.rememberMe as boolean | undefined;

    if (!idToken) {
      console.warn('[auth/login] Missing idToken');
      return NextResponse.json({ error: 'idToken manquant' }, { status: 400 });
    }

    // 1. Vérification du token Firebase Admin
    step = 'verifyIdToken';
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/login] verifyIdToken returned null. Token length:', idToken?.length, 'Elapsed:', Date.now() - startTime, 'ms');
      return NextResponse.json(
        { error: 'Session invalide. Veuillez réessayer.' },
        { status: 401 },
      );
    }
    console.log('[auth/login] Token verified for:', user.email, 'uid:', user.uid, 'in', Date.now() - startTime, 'ms');

    // 2. Récupération du profil Firestore
    step = 'fetchProfile';
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
    //    Si le profil n'existe pas, on le crée automatiquement (auto-repair).
    //    Cela peut arriver si l'inscription a échoué après la création Firebase.
    if (!profile) {
      step = 'autoCreateProfile';
      console.warn('[auth/login] No profile found for uid:', user.uid, '— auto-creating');
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
            credits: 50,
            isActive: true,
            isCreator: false,
            creatorEarnings: 0,
            creatorWithdrawn: 0,
            createdAt: now,
            updatedAt: now,
            lastActiveAt: now,
          },
          update: {
            name: user.displayName || undefined,
            avatar: user.photoURL || undefined,
            emailVerified: user.emailVerified,
            lastActiveAt: now,
            updatedAt: now,
          },
        });
        profile = (await db.user.findUnique({
          where: { id: user.uid },
        })) as UserProfile | null;
      } catch (createErr) {
        console.error('[auth/login] auto-create profile failed:', createErr);
      }

      if (!profile) {
        return NextResponse.json(
          { error: 'Impossible de créer le profil utilisateur. Contactez le support.' },
          { status: 500 },
        );
      }
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

    // 6. Création du cookie de session Firebase (14 jours)
    step = 'setSessionCookie';
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
    step = 'updateProfile';
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

    // 8. Audit log (non bloquant)
    step = 'auditLog';
    try {
      await createAuditLog({
        userId: user.uid,
        action: 'user.login',
        resource: 'auth',
        details: {
          email: user.email,
          method: user.providerData?.[0]?.providerId || 'password',
          durationMs: Date.now() - startTime,
        },
        severity: 'info',
      });
    } catch {}

    // 9. Réponse client
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
        role: (user.customClaims?.role as string) || (profile as any).role || 'user',
        plan: (profile as any).plan || 'free',
        credits: (profile as any).credits ?? 0,
        isActive: (profile as any).isActive ?? true,
        isCreator: (profile as any).isCreator ?? false,
      },
    });
  } catch (error) {
    console.error('[auth/login] Error at step', step, 'after', Date.now() - startTime, 'ms:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur d'authentification" },
      { status: 500 },
    );
  }
}
