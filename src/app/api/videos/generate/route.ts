import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { userId, prompt } = b;
    if (!userId || !prompt) return NextResponse.json({ error: 'userId et prompt requis' }, { status: 400 });
    const v = await db.videoGeneration.create({ data: { userId, prompt, provider: 'huggingface', status: 'processing' } });
    return NextResponse.json({ generationId: v.id, status: 'processing' });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
