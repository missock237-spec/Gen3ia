// GET  /api/admin/gpu-cluster/nodes — List all GPU nodes (admin)
// POST /api/admin/gpu-cluster/nodes — Register a new GPU node
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { gpuCluster } from '@/lib/gpu-cluster/manager';
import type { GpuType, NodeStatus } from '@/lib/gpu-cluster/manager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as NodeStatus | null;
  const nodes = await gpuCluster.listNodes(status ?? undefined);
  // Enrichir avec métriques temps réel (best-effort, non-bloquant)
  const nodesWithMetrics = await Promise.all(
    nodes.map(async (n) => {
      try {
        const metrics = await gpuCluster.getNodeMetrics(n.id);
        return { ...n, metrics };
      } catch {
        return { ...n, metrics: [] };
      }
    }),
  );
  return NextResponse.json({ nodes: nodesWithMetrics });
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
    const node = await gpuCluster.registerNode({
      name: body.name,
      gpuType: body.gpuType as GpuType,
      gpuCount: body.gpuCount || 1,
      gpuMemoryGb: body.gpuMemoryGb || 24,
      cpuCores: body.cpuCores || 8,
      ramGb: body.ramGb || 32,
      endpoint: body.endpoint,
      region: body.region,
      status: body.status || 'online',
    });
    return NextResponse.json({ ok: true, node });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}
