// GET  /api/training/datasets — List datasets (owner or admin)
// POST /api/training/datasets — Create dataset
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { trainingPipeline } from '@/lib/training/pipeline';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const datasets = await trainingPipeline.listDatasets(auth.userId);
  return NextResponse.json({ datasets });
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const dataset = await trainingPipeline.createDataset({
      name: body.name,
      description: body.description,
      format: body.format,
      size: body.size,
      hfDatasetId: body.hfDatasetId,
      storageUrl: body.storageUrl,
      metadata: body.metadata,
      tags: body.tags,
      ownerId: auth.userId,
    });
    return NextResponse.json({ ok: true, dataset });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
