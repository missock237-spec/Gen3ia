import { NextRequest, NextResponse } from 'next/server';
import { computeEngine } from '@/lib/compute';
import { createLogger } from '@/lib/logger';
const log = createLogger('api-compute');

export async function POST(request: NextRequest) {
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
}
