// ============================================================
// POST /api/agents/suite — Créer et lancer une suite multi-agents
// GET  /api/agents/suite — Lister les suites de l'utilisateur
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { orchestrator } from '@/lib/agent-orchestrator';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('api-agents-suite');

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return error || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, goal, strategy, agents, context } = body;

    if (!name || !goal) {
      return NextResponse.json({ error: 'name et goal requis' }, { status: 400 });
    }

    // Créer la suite
    const suite = await prisma.agentSuite.create({
      data: {
        name,
        goal,
        userId: auth.userId,
        strategy: strategy || 'sequential',
        status: 'idle',
      },
    });

    let agentConfigs: { id: string; name: string; role: string; model: string; systemPrompt: string; temperature: number; maxTokens: number }[] = [];

    if (agents && agents.length > 0) {
      // Utiliser les agents fournis
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const created = await prisma.agent.create({
          data: {
            name: agent.name,
            role: agent.role || 'member',
            description: agent.description || '',
            systemPrompt: agent.systemPrompt || '',
            model: agent.model || 'gpt-4o-mini',
            temperature: agent.temperature || 0.7,
            maxTokens: agent.maxTokens || 4096,
            userId: auth.userId,
            suiteId: suite.id,
          },
        });

        await prisma.agentSuiteAgent.create({
          data: {
            suiteId: suite.id,
            agentId: created.id,
            order: i,
            role: agent.role === 'coordinator' ? 'coordinator' : 'member',
          },
        });

        agentConfigs.push({
          id: created.id,
          name: created.name,
          role: created.role as any,
          model: created.model,
          systemPrompt: created.systemPrompt || '',
          temperature: created.temperature,
          maxTokens: created.maxTokens,
        });
      }
    } else {
      // Créer la suite par défaut
      const suiteId = await orchestrator.createDefaultSuite(auth.userId, name, goal);
      
      const defaultSuite = await prisma.agentSuite.findUnique({
        where: { id: suiteId },
        include: { agents: { include: { agent: true } } },
      });

      if (defaultSuite) {
        agentConfigs = defaultSuite.agents.map(sa => ({
          id: sa.agent.id,
          name: sa.agent.name,
          role: sa.role as any,
          model: sa.agent.model,
          systemPrompt: sa.agent.systemPrompt || '',
          temperature: sa.agent.temperature,
          maxTokens: sa.agent.maxTokens,
        }));
      }
    }

    // Lancer l'exécution
    const result = await orchestrator.runSuite({
      suiteId: suite.id,
      userId: auth.userId,
      goal,
      context,
      strategy: strategy || 'sequential',
// @ts-ignore
      agents: agentConfigs,
    });

    log.info('suite_created_and_run', { suiteId: suite.id, executionId: result.executionId });

    return NextResponse.json({
      success: true,
      suite: { id: suite.id, name, strategy: strategy || 'sequential' },
      execution: result,
    });
  } catch (err) {
    log.error('suite_create_error', { error: String(err) });
    return NextResponse.json({ error: 'Erreur lors de la création de la suite' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return error || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const suites = await prisma.agentSuite.findMany({
      where: { userId: auth.userId },
      include: {
        agents: {
          include: { agent: { select: { id: true, name: true, role: true, model: true } } },
          orderBy: { order: 'asc' },
        },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, totalCost: true, startedAt: true, completedAt: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ success: true, suites });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
