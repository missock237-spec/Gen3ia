// ============================================================
// POST /api/agents/improve — Déclencher l'auto-amélioration
// GET  /api/agents/improve — Voir historique améliorations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { improvementEngine } from '@/lib/self-improvement';
import { applySecurity } from '@/lib/security';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('api-improve');

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const { agentId } = body;

    if (agentId) {
      // Améliorer un agent spécifique
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId: auth.userId },
      });

      if (!agent) {
        return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 });
      }

      const action = await improvementEngine.analyzeAndImprove(agentId);

      if (!action) {
        return NextResponse.json({
          success: true,
          improved: false,
          message: "L'agent fonctionne de manière optimale. Aucune amélioration nécessaire.",
        });
      }

      log.info('agent_improved', { agentId: agentId.slice(0, 8), action: action.action });

      return NextResponse.json({
        success: true,
        improved: true,
        action,
      });
    } else {
      // Améliorer tous les agents de l'utilisateur
      const agents = await prisma.agent.findMany({
        where: { userId: auth.userId, status: 'active' },
        select: { id: true },
      });

      let improved = 0;
      const results = [];

      for (const agent of agents) {
        const action = await improvementEngine.analyzeAndImprove(agent.id);
        if (action) {
          improved++;
// @ts-ignore
          results.push({ agentId: agent.id, action: action.action });
        }
      }

      log.info('agents_batch_improved', { userId: auth.userId.slice(0, 8), improved, total: agents.length });

      return NextResponse.json({
        success: true,
        improved,
        total: agents.length,
        results,
      });
    }
  } catch (err) {
    log.error('improve_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!agentId) {
      return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
    }

    const history = await improvementEngine.getImprovementHistory(agentId, limit);

    return NextResponse.json({ success: true, history });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
