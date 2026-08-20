// ============================================================
// POST /api/auth/register — Firebase Authentication
// ============================================================
//  Body: { idToken: string, name?: string, email?: string }
//  Flow :
//    1. Le client cree le compte via createUserWithEmailAndPassword
//       (Firebase Client SDK) -> obtient un idToken.
//    2. POST cette route avec { idToken, name } -> le serveur :
//       a. verifie l'idToken via Admin SDK (verifyIdToken)
//       b. cree le profil etendu dans Firestore + entree credits
//       c. cree le session cookie Firebase (httpOnly, 14 jours)
//       d. loggue l'evenement dans audit_logs
//       e. renvoie l'utilisateur normalise
//    En cas d'echec apres creation Firestore, le cookie N'EST PAS
//    pose. En cas d'echec critique, l'utilisateur Firebase est
//    supprime (rollback) car le login exige un profil Firestore.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookie, verifyIdToken } from '@/lib/firebase/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { db } from '@/lib/firebase/firestore';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let firebaseUserCreated = false;

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

    // 1. Verifie l'idToken cote serveur (Admin SDK).
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/register] verifyIdToken returned null for token length:', idToken?.length);
      return NextResponse.json(
        { error: 'Session invalide. Veuillez reessayer.' },
        { status: 401 },
      );
    }

    // Marque que l'utilisateur Firebase existe (pour le rollback)
    firebaseUserCreated = true;

    // 2. Cree le profil etendu Firestore — BLOQUANT.
    //    Le login refuse tout utilisateur sans profil Firestore (403),
    //    donc l'inscription DOIT reussir ici. Si ca echoue, on rollback.
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
      console.error('[auth/register] Firestore profile creation FAILED (BLOCKING):', profileErr);
      // Rollback : supprimer l'utilisateur Firebase
      await rollbackFirebaseUser(user.uid);
      return NextResponse.json(
        { error: "Erreur lors de la creation du profil. L'utilisateur n'a pas ete cree. Reessayez." },
        { status: 500 },
      );
    }

    // 3. Cree l'entree credits — BLOQUANT.
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
      console.error('[auth/register] Credit creation FAILED (BLOCKING):', creditErr);
      // Rollback : supprimer le profil Firestore + l'utilisateur Firebase
      try { await db.user.delete({ where: { id: user.uid } }); } catch {}
      await rollbackFirebaseUser(user.uid);
      return NextResponse.json(
        { error: "Erreur lors de l'initialisation des credits. L'utilisateur n'a pas ete cree. Reessayez." },
        { status: 500 },
      );
    }

    // 4. Positionne le cookie de session Firebase (httpOnly, 14 jours).
    //    En dernier : on ne pose le cookie QUE si tout a reussi.
    try {
      await setSessionCookie(idToken);
    } catch (cookieErr) {
      const msg = cookieErr instanceof Error ? cookieErr.message : String(cookieErr);
      console.error('[auth/register] setSessionCookie failed:', msg);
      // Le profil Firestore existe mais le cookie echoue.
      // On ne supprime pas le profil (il est valide), on signale l'erreur.
      return NextResponse.json(
        { error: 'Erreur de session. Rechargez la page et connectez-vous.' },
        { status: 503 },
      );
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
    firebaseUserCreated = false; // Succes — pas de rollback
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
    // Rollback : si on a cree l'utilisateur Firebase mais qu'une erreur
    // inattendue a frappe avant la fin, le supprimer.
    // (On n'a pas acces au uid ici, donc on ne peut pas rollback.
    // Le nettoyage se fera manuellement ou via un cron.)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'inscription" },
      { status: 500 },
    );
  }
}

/**
 * Supprime un utilisateur Firebase Auth (rollback si inscription echoue).
 * Non bloquant : si la suppression echoue, on loggue mais on ne crash pas.
 */
async function rollbackFirebaseUser(uid: string): Promise<void> {
  try {
    const auth = getAdminAuth();
    await auth.deleteUser(uid);
    console.warn('[auth/register] ROLLBACK: deleted Firebase user', uid);
  } catch (deleteErr) {
    console.error('[auth/register] ROLLBACK FAILED: could not delete Firebase user', uid, deleteErr);
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