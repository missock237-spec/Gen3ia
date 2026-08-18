// POST /api/admin/model-registry/seed — Initialise le catalogue de modèles
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { seedModelRegistry } from '@/lib/model-registry/seed';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  try {
    const result = await seedModelRegistry();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
