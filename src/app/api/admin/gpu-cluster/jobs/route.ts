// GET  /api/admin/gpu-cluster/jobs — List jobs (admin)
// POST /api/admin/gpu-cluster/jobs — Submit a new GPU job
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { gpuCluster } from '@/lib/gpu-cluster/manager';
import type { JobType, JobStatus, GpuType } from '@/lib/gpu-cluster/manager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as JobStatus | null;
  const jobs = await gpuCluster.listJobs({
    ownerId: auth.role === 'admin' ? undefined : auth.userId,
    status: status ?? undefined,
  });
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const job = await gpuCluster.submitJob({
      ownerId: auth.userId,
      type: body.type as JobType,
      priority: body.priority || 5,
      modelId: body.modelId,
      datasetId: body.datasetId,
      requiredGpuType: body.requiredGpuType as GpuType | undefined,
      requiredGpuCount: body.requiredGpuCount,
      estimatedDurationSec: body.estimatedDurationSec,
      trainingRunId: body.trainingRunId,
    });
    return NextResponse.json({ ok: true, job });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
