// ============================================================
// GET / PATCH /api/auth/profile — Profil utilisateur (Firestore)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

import { getServerSession, updateUser } from '@/lib/firebase/auth';
import { db } from '@/lib/firebase/firestore';
import { createAuditLog } from '@/lib/firebase/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const profile = await db.user.findUnique({ where: { id: session.user.id } });
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[auth/profile GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 });

    // Champs modifiables
    const allowedFields = ['name', 'avatar', 'bio', 'preferences', 'language', 'timezone'];
    const patch: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) patch[field] = body[field];
    }
    patch.updatedAt = new Date();

    // Update Firestore profile
    const updated = await db.user.update({ where: { id: session.user.id }, data: patch });

    // Sync displayName / photoURL vers Firebase Auth si modifiés
    if (body.name || body.avatar) {
      await updateUser(session.user.id, {
        ...(body.name ? { displayName: body.name } : {}),
        ...(body.avatar ? { photoURL: body.avatar } : {}),
      });
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'user.profile.update',
      resource: 'profile',
      details: { fields: Object.keys(patch) },
      severity: 'info',
    });

    return NextResponse.json({ profile: updated });
  } catch (error) {
    console.error('[auth/profile PATCH] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 },
    );
  }
}
