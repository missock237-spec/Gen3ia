// GET  /api/admin/gpu-cluster/stats — Vue d'ensemble du cluster GPU
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { gpuCluster } from '@/lib/gpu-cluster/manager';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  const stats = await gpuCluster.getClusterStats();
  return NextResponse.json({ stats });
}
