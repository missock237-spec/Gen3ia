// ============================================================
// POST /api/auth/verify-email — Vérification email (Firebase)
// ============================================================
//  Body: { oobCode }
//  Firebase gère la vérification côté client via applyActionCode.
//  Cette route synchronise l'état côté serveur (Firestore mirror).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '@/lib/firebase/admin';
import { db } from '@/lib/firebase/firestore';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const oobCode = body?.oobCode as string | undefined;
    const uid = body?.uid as string | undefined;

    if (!oobCode || !uid) {
      return NextResponse.json({ error: 'oobCode et uid requis' }, { status: 400 });
    }

    // Met à jour l'état emailVerified côté Firebase Auth
    await getAdminAuth().updateUser(uid, { emailVerified: true });

    // Sync Firestore
    await db.user.update({
      where: { id: uid },
      data: { emailVerified: true, updatedAt: new Date() },
    });

    await createAuditLog({
      userId: uid,
      action: 'auth.email.verified',
      resource: 'auth',
      severity: 'info',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/verify-email] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
