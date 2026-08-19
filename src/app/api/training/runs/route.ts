// GET  /api/training/runs — List runs (owner or admin)
// POST /api/training/runs — Submit a training run
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { trainingPipeline } from '@/lib/training/pipeline';
import type { TrainingMethod } from '@/lib/training/pipeline';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const runs = await trainingPipeline.listRuns(auth.userId);
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body.datasetId) {
      return NextResponse.json({ error: 'datasetId requis' }, { status: 400 });
    }
    if (!body.hyperparams?.baseModelId) {
      return NextResponse.json({ error: 'hyperparams.baseModelId requis' }, { status: 400 });
    }

    const run = await trainingPipeline.submitRun({
      datasetId: body.datasetId,
      ownerId: auth.userId,
      hyperparams: {
        method: (body.hyperparams.method || 'lora') as TrainingMethod,
        loraRank: body.hyperparams.loraRank,
        loraAlpha: body.hyperparams.loraAlpha,
        learningRate: body.hyperparams.learningRate || 2e-4,
        numEpochs: body.hyperparams.numEpochs || 3,
        perDeviceBatchSize: body.hyperparams.perDeviceBatchSize || 4,
        gradientAccumulationSteps: body.hyperparams.gradientAccumulationSteps,
        warmupSteps: body.hyperparams.warmupSteps,
        maxSeqLength: body.hyperparams.maxSeqLength,
        baseModelId: body.hyperparams.baseModelId,
        gpuType: body.hyperparams.gpuType,
        numGpus: body.hyperparams.numGpus,
        quantization: body.hyperparams.quantization,
      },
    });
    return NextResponse.json({ ok: true, run });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
