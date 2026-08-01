import { NextRequest, NextResponse } from 'next/server';
import { computeEngine } from '@/lib/compute';
import { createLogger } from '@/lib/logger';
import { withAuth } from '@/lib/with-auth';

const log = createLogger('api-compute');

// POST /api/compute — Exécute des calculs CPU/GPU (COÛTEUX)
// SECURITE: withAuth() + quota (le compute peut être abusé pour DoS)
export const POST = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const body = await request.json();
    const { task, data, options = {} } = body;
    if (!task) return NextResponse.json({ error: 'Tache requise' }, { status: 400 });

    if (task === 'benchmark') {
      const results = await computeEngine.benchmark();
      return NextResponse.json({ success: true, results });
    }

    if (!computeEngine.isSupported(task)) return NextResponse.json({ error: `Tache non supportee: ${task}` }, { status: 400 });

    let result;
    switch (task) {
      case 'matrix-multiply':
        result = await computeEngine.matrixMultiply(data.A, data.B, data.rowsA, data.colsA, data.colsB, options);
        break;
      case 'convolution':
        result = await computeEngine.convolve(data.input, data.kernel, data.width, data.height, data.kernelSize);
        break;
      case 'batch-normalize':
        result = await computeEngine.batchNormalize(data.values);
        break;
      default:
        return NextResponse.json({ error: 'Tache non reconnue' }, { status: 400 });
    }
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 }, // 10 calculs/min max
  quota: true, // Le compute consomme des ressources → vérifier quota
});
