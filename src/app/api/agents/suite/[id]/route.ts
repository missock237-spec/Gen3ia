// ============================================================
// GET  /api/agents/suite/[id] — Détails d'une suite
// POST /api/agents/suite/[id]/run — Lancer l'exécution
// DELETE /api/agents/suite/[id] — Supprimer une suite
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { orchestrator } from '@/lib/agent-orchestrator';
import { applySecurity } from '@/lib/security';
import { createLogger } from '@/lib/logger';

export const dynamic = "force-dynamic";
const log = createLogger('api-suite-detail');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const suite = await prisma.agentSuite.findFirst({
      where: { id: (await params).id, userId: auth.userId },
      include: {
        agents: {
          include: { agent: true },
          orderBy: { order: 'asc' },
        },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          include: {
            messages: {
              orderBy: { round: 'asc' },
              take: 50,
            },
          },
        },
      },
    });

    if (!suite) {
      return NextResponse.json({ error: 'Suite introuvable' }, { status: 404 });
    }

    return NextResponse.json({ success: true, suite });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const suite = await prisma.agentSuite.findFirst({
      where: { id: (await params).id, userId: auth.userId },
      include: {
        agents: { include: { agent: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!suite) {
      return NextResponse.json({ error: 'Suite introuvable' }, { status: 404 });
    }

    const body = await request.json();
    const goal = body.goal || suite.goal || '';
    const context = body.context || undefined;
    const strategy = body.strategy || suite.strategy;

    if (!goal) {
      return NextResponse.json({ error: 'Objectif requis' }, { status: 400 });
    }

    const agentConfigs = suite.agents.map(sa => ({
      id: sa.agent.id,
      name: sa.agent.name,
      role: sa.role as any,
      model: sa.agent.model,
      systemPrompt: sa.agent.systemPrompt || '',
      temperature: sa.agent.temperature,
      maxTokens: sa.agent.maxTokens,
    }));

    const result = await orchestrator.runSuite({
      suiteId: suite.id,
      userId: auth.userId,
      goal,
      context,
      strategy: strategy as any,
      agents: agentConfigs,
      maxRounds: suite.maxRounds,
    });

    log.info('suite_executed', { suiteId: suite.id, executionId: result.executionId });

    return NextResponse.json({ success: true, execution: result });
  } catch (err) {
    log.error('suite_execution_error', { error: String(err) });
    return NextResponse.json({ error: "Erreur d'exécution" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const suite = await prisma.agentSuite.findFirst({
      where: { id: (await params).id, userId: auth.userId },
    });

    if (!suite) {
      return NextResponse.json({ error: 'Suite introuvable' }, { status: 404 });
    }

    await prisma.agentSuite.delete({ where: { id: (await params).id } });

    return NextResponse.json({ success: true, message: 'Suite supprimée' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
