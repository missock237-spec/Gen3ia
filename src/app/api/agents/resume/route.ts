// ============================================================
// GET /api/agents/resume — Liste les exécutions interrompues récupérables
// POST /api/agents/resume — Reprend une exécution interrompue
// ============================================================
//  Permet aux utilisateurs de :
//    1. Voir quelles tâches d'agents ont crashé et peuvent être reprises
//    2. Relancer une tâche depuis son dernier checkpoint
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { checkpointManager } from '@/lib/agent-engine/checkpoint-manager';
import { db } from '@/lib/db';

// GET — Lister les exécutions récupérables
export async function GET(request: Request) {
  return withAuth(request, async (auth) => {
    try {
      const resumable = await checkpointManager.findResumableExecutions(auth.userId);

      // Enrichir avec les infos d'agent
      const agentIds = [...new Set(resumable.map(c => c.agentId))];
      const agents = agentIds.length > 0
        ? await db.agent.findMany({ where: { id: { in: agentIds } } })
        : [];
      const agentMap: Record<string, Record<string, unknown>> = {};
      for (const a of agents as Record<string, unknown>[]) {
        agentMap[a.id as string] = a;
      }

      const result = resumable.map(cp => ({
        executionId: cp.executionId,
        agentId: cp.agentId,
        agentName: agentMap[cp.agentId]?.name || 'Agent supprimé',
        agentType: agentMap[cp.agentId]?.type || 'unknown',
        task: cp.task,
        status: cp.status,
        stepsCompleted: cp.steps.length,
        currentStepIndex: cp.currentStepIndex,
        totalTokensUsed: cp.totalTokensUsed,
        totalCost: cp.totalCost,
        startedAt: cp.startedAt,
        lastCheckpointAt: cp.lastCheckpointAt,
        error: cp.error,
        retryCount: cp.retryCount,
      }));

      return NextResponse.json({
        success: true,
        count: result.length,
        resumable: result,
      });
    } catch (err) {
      console.error('[resume] GET error:', err);
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des exécutions interrompues' },
        { status: 500 }
      );
    }
  });
}

// POST — Reprendre une exécution
export async function POST(request: Request) {
  return withAuth(request, async (auth) => {
    try {
      const body = await request.json();
      const { executionId } = body;

      if (!executionId) {
        return NextResponse.json(
          { error: 'executionId requis' },
          { status: 400 }
        );
      }

      // Charger le checkpoint
      const checkpoint = await checkpointManager.load(executionId);
      if (!checkpoint) {
        return NextResponse.json(
          { error: 'Aucun checkpoint trouvé pour cette exécution' },
          { status: 404 }
        );
      }

      // Vérifier que l'utilisateur est le propriétaire
      if (checkpoint.userId !== auth.userId) {
        return NextResponse.json(
          { error: 'Non autorisé' },
          { status: 403 }
        );
      }

      // Vérifier que l'agent existe toujours
      const agent = await db.agent.findUnique({
        where: { id: checkpoint.agentId },
      });

      if (!agent) {
        return NextResponse.json(
          { error: 'Agent associé introuvable' },
          { status: 404 }
        );
      }

      // Incrémenter le compteur de retry et remettre en statut running
      await checkpointManager.save({
        ...checkpoint,
        status: 'running',
        retryCount: checkpoint.retryCount + 1,
      }, true);

      // Déclencher la reprise via l'API d'exécution interne
      // L'exécution reprendra depuis le checkpoint automatiquement
      // grâce à la logique dans execution-loop.ts
      const resumeUrl = new URL(`/api/agents/${checkpoint.agentId}/execute`, request.url);
      const resumeResponse = await fetch(resumeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('Cookie') || '',
        },
        body: JSON.stringify({
          task: checkpoint.task,
          executionId: checkpoint.executionId,
          resumeFromCheckpoint: true,
        }),
      });

      if (!resumeResponse.ok) {
        const errData = await resumeResponse.json().catch(() => ({}));
        return NextResponse.json(
          { error: 'Échec de la reprise', details: errData },
          { status: 500 }
        );
      }

      const data = await resumeResponse.json();
      return NextResponse.json({
        success: true,
        message: `Reprise de l'exécution "${checkpoint.task}" depuis l'étape ${checkpoint.currentStepIndex}`,
        executionId: checkpoint.executionId,
        retryCount: checkpoint.retryCount + 1,
        data,
      });
    } catch (err) {
      console.error('[resume] POST error:', err);
      return NextResponse.json(
        { error: 'Erreur lors de la reprise' },
        { status: 500 }
      );
    }
  });
}
