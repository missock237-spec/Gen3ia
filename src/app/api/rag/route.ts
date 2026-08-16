import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';




export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, userId } = body;
    if (!query || !userId) return NextResponse.json({ error: 'query et userId requis' }, { status: 400 });
    const results = await db.knowledge.findMany({
      where: { userId, content: { contains: query, mode: 'insensitive' } },
      orderBy: { relevance: 'desc' },
      take: 10,
      select: { id: true, content: true, category: true, relevance: true, source: true },
    });
    const docResults = await db.documentChunk.findMany({
      where: { userId, content: { contains: query, mode: 'insensitive' } },
      take: 10,
      select: { id: true, content: true, documentId: true },
    });
    return NextResponse.json({ results, docResults, total: results.length + docResults.length });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
