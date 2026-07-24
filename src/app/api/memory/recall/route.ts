import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { userId, query, category } = b;
    if (!userId || !query) return NextResponse.json({ error: 'userId et query requis' }, { status: 400 });
    const memories = await db.agentMemory.findMany({
      where: { userId, ...(category ? { category } : {}), content: { contains: query, mode: 'insensitive' } },
      orderBy: { relevance: 'desc' },
      take: 10,
    });
    return NextResponse.json(memories);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
