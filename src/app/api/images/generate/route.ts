import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { userId, prompt, model } = b;
    if (!userId || !prompt) return NextResponse.json({ error: 'userId et prompt requis' }, { status: 400 });
    const g = await db.imageGeneration.create({ data: { userId, prompt, model: model || 'flux', provider: 'huggingface', status: 'processing', width: 1024, height: 1024 } });
    return NextResponse.json({ generationId: g.id, status: 'processing' });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
