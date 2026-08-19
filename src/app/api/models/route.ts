// GET  /api/models — Liste publique des modèles du catalogue (authentifié)
// POST /api/models — Créer / mettre à jour une entrée (admin only)
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { modelRegistry } from '@/lib/model-registry';
import type { ModelType, ModelProvider, ModelCapability, LicenseType } from '@/lib/model-registry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as ModelType | null;
  const provider = searchParams.get('provider') as ModelProvider | null;
  const capability = searchParams.get('capability') as ModelCapability | null;
  const license = searchParams.get('license') as LicenseType | null;
  const freeOnly = searchParams.get('freeOnly') === 'true';
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;

  const models = await modelRegistry.list({
    type: type ?? undefined,
    provider: provider ?? undefined,
    capability: capability ?? undefined,
    license: license ?? undefined,
    freeOnly,
    limit,
  });

  return NextResponse.json({ models, total: models.length });
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const entry = await modelRegistry.upsert(body);
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
