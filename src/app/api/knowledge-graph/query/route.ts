// POST /api/knowledge-graph/query — Requête hybride (vectorielle + graphe)
// GET  /api/knowledge-graph/stats — Stats (admin)
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { knowledgeGraph } from '@/lib/knowledge-graph';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  try {
    const body = await request.json();
    // Embedding doit être fourni par le caller (ou null pour lookup par nom seulement)
    const queryEmbedding: number[] | undefined = Array.isArray(body.queryEmbedding)
      ? body.queryEmbedding
      : undefined;
    const queryEntities: string[] = Array.isArray(body.queryEntities) ? body.queryEntities : [];
    const hops = typeof body.hops === 'number' ? body.hops : 1;
    const topK = typeof body.topK === 'number' ? body.topK : 5;

    const result = await knowledgeGraph.hybridQuery({
      queryEmbedding,
      queryEntities,
      hops,
      topK,
      workspaceId: body.workspaceId,
    });

    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspaceId') ?? undefined;
  const stats = await knowledgeGraph.getStats(workspaceId);
  return NextResponse.json({ stats });
}
