import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { validateBody, ragQuerySchema } from '@/lib/validation';
import { withAuth, type RouteParams } from '@/lib/with-auth';





export const dynamic = "force-dynamic";
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json();
    const validation = validateBody(ragQuerySchema, body);
    if (!validation.success) return validation.error;

    const { query, topK } = validation.data;
    const userId = auth.userId;
    const engine = getAgentEngine();

    const chunks = await engine.ragRetriever.retrieve(query, userId, { topK });
    const knowledge = await engine.longTermMemory.search(query, userId, { limit: 3 });

    return NextResponse.json({
      query, chunks,
      knowledge: knowledge.map(k => ({ content: k.entry.content, category: k.entry.category, source: k.entry.source, relevance: k.entry.relevance, score: k.score, matchType: k.matchType })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur lors de la recherche' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
  quota: true,
});
