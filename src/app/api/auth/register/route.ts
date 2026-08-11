// ============================================================
// POST /api/auth/register — Firebase Authentication
// ============================================================
//  Body: { email, password, name? }
//  Flux :
//    1. Côté client : createUserWithEmailAndPassword -> obtient idToken
//    2. POST cette route avec { idToken, name } -> crée le profil
//       Firestore + positionne le session cookie.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { setSessionCookie, getUserByUid, validatePasswordStrength } from '@/lib/firebase/auth';
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
      return NextResponse.json({ error: 'idToken manquant (créez le compte côté client via createUserWithEmailAndPassword)' }, { status: 400 });
    }

    // Positionne le cookie de session
    await setSessionCookie(idToken);

    // Récupère l'utilisateur Firebase
    const user = await getUserByUid(
      (await (await import('@/lib/firebase/admin')).getAdminAuth().verifySessionCookie(
        (await import('next/headers')).cookies().get('gen3ia_session')?.value || '',
        true,
      )).uid,
    );

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    // Crée le profil Firestore (mirror étendu de Firebase Auth)
    const now = new Date();
    await db.user.createWithId(user.uid, {
      uid: user.uid,
      email: user.email || '',
      name: name || user.displayName || user.email?.split('@')[0] || 'Utilisateur',
      avatar: user.photoURL || null,
      emailVerified: user.emailVerified,
      plan: 'free',
      role: 'user',
      credits: 100, // crédits de bienvenue
      isActive: true,
      isCreator: false,
      creatorEarnings: 0,
      creatorWithdrawn: 0,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });

    // Crée l'entrée crédits
    await db.credit.createWithId(`credit_${user.uid}`, {
      userId: user.uid,
      balance: 100,
      totalEarned: 100,
      totalSpent: 0,
      currency: 'credits',
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    await createAuditLog({
      userId: user.uid,
      action: 'user.register',
      resource: 'auth',
      details: { email: user.email, method: 'password' },
      severity: 'info',
    });

    return NextResponse.json({
      user: {
        id: user.uid,
        uid: user.uid,
        email: user.email,
        name: name || user.displayName,
        picture: user.photoURL,
        emailVerified: user.emailVerified,
        role: 'user',
      },
    });
  } catch (error) {
    console.error('[auth/register] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de l\'inscription' },
      { status: 500 },
    );
  }
}

/**
 * Validation côté serveur de la force du mot de passe.
 * À appeler côté client AVANT createUserWithEmailAndPassword.
 */
export async function GET() {
  return NextResponse.json({
    passwordPolicy: {
      min: 8,
      rules: ['Au moins 8 caractères', 'Au moins une majuscule', 'Au moins une minuscule', 'Au moins un chiffre'],
    },
  });
}

export { validatePasswordStrength };
