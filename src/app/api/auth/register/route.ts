// ============================================================
// POST /api/auth/register — Firebase Authentication
// ============================================================
//  Body: { idToken: string, name?: string, email?: string }
//  Flow :
//    1. Le client cree le compte via createUserWithEmailAndPassword
//       (Firebase Client SDK) -> obtient un idToken.
//    2. POST cette route avec { idToken, name } -> le serveur :
//       a. verifie l'idToken via Admin SDK (verifyIdToken)
//       b. cree le session cookie Firebase (httpOnly, 14 jours)
//       c. cree le profil etendu dans Firestore + entree credits
//       d. loggue l'evenement dans audit_logs
//       e. renvoie l'utilisateur normalise
//  Side-effect: positionne le cookie `gen3ia_session` (httpOnly, 14 jours).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookie, verifyIdToken } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/firestore';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    const name = body?.name as string | undefined;

    if (!idToken) {
      return NextResponse.json(
        { error: 'idToken manquant' },
        { status: 400 },
      );
    }

    // 1. Verifie l'idToken cote serveur (Admin SDK) et recupere l'utilisateur.
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/register] verifyIdToken returned null for token length:', idToken?.length);
      return NextResponse.json(
        { error: 'Session invalide. Veuillez reessayer.' },
        { status: 401 },
      );
    }

    // 2. Positionne le cookie de session Firebase (httpOnly, 14 jours).
    //    Try/catch dedie : si createSessionCookie echoue (Admin SDK
    //    indisponible, token rejete), on renvoie une erreur claire
    //    au lieu de laisser remonter en 500 generique.
    try {
      await setSessionCookie(idToken);
    } catch (cookieErr) {
      const msg = cookieErr instanceof Error ? cookieErr.message : String(cookieErr);
      console.error('[auth/register] setSessionCookie failed:', msg);
      return NextResponse.json(
        { error: 'Erreur de session. Veuillez reessayer.' },
        { status: 503 },
      );
    }

    // 3. Cree le profil etendu Firestore (mirror de Firebase Auth).
    const now = new Date();
    const fallbackName = name || user.displayName || user.email?.split('@')[0] || 'Utilisateur';
    try {
      await db.user.upsert({
        where: { id: user.uid },
        create: {
          id: user.uid,
          uid: user.uid,
          email: user.email || (body?.email as string) || '',
          name: fallbackName,
          avatar: user.photoURL || null,
          emailVerified: user.emailVerified,
          plan: 'free',
          role: 'user',
          credits: 100,
          isActive: true,
          isCreator: false,
          creatorEarnings: 0,
          creatorWithdrawn: 0,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
        },
        update: {
          name: name || user.displayName || undefined,
          avatar: user.photoURL || undefined,
          emailVerified: user.emailVerified,
          lastActiveAt: now,
          updatedAt: now,
        },
      });
    } catch (profileErr) {
      console.error('[auth/register] profile upsert failed (non-fatal):', profileErr);
    }

    // 4. Cree l'entree credits (idempotent).
    try {
      const existingCredit = await db.credit.findUnique({ where: { id: `credit_${user.uid}` } });
      if (!existingCredit) {
        await db.credit.createWithId(`credit_${user.uid}`, {
          id: `credit_${user.uid}`,
          userId: user.uid,
          balance: 100,
          totalEarned: 100,
          totalSpent: 0,
          currency: 'credits',
          createdAt: now,
          updatedAt: now,
        });
      }
    } catch (creditErr) {
      console.error('[auth/register] credit creation failed (non-fatal):', creditErr);
    }

    // 5. Audit log (non bloquant).
    try {
      await createAuditLog({
        userId: user.uid,
        action: 'user.register',
        resource: 'auth',
        details: { email: user.email, method: user.providerData?.[0]?.providerId || 'password' },
        severity: 'info',
      });
    } catch (auditErr) {
      console.error('[auth/register] audit log failed (non-fatal):', auditErr);
    }

    // 6. Reponse normalisee.
    return NextResponse.json({
      user: {
        id: user.uid,
        uid: user.uid,
        email: user.email || (body?.email as string) || '',
        name: fallbackName,
        avatar: user.photoURL || null,
        picture: user.photoURL || null,
        emailVerified: user.emailVerified,
        isEmailVerified: user.emailVerified,
        role: 'user',
        plan: 'free',
        credits: 100,
        isActive: true,
        isCreator: false,
      },
    });
  } catch (error) {
    console.error('[auth/register] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'inscription" },
      { status: 500 },
    );
  }
}

/**
 * Validation cote serveur de la force du mot de passe.
 */
export async function GET() {
  return NextResponse.json({
    passwordPolicy: {
      min: 8,
      rules: ['Au moins 8 caracteres', 'Au moins une majuscule', 'Au moins une minuscule', 'Au moins un chiffre'],
    },
  });
}
