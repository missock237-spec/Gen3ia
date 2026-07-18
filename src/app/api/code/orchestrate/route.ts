// POST /api/code/orchestrate - Orchestration multi-agents
// Un objectif utilisateur -> plusieurs agents specialises deployes automatiquement
import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/code-engine/orchestrator-core';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, goalId, description, priority } = body;

    switch (action) {
      // Creer et lancer une orchestration
      case 'start': {
        if (!userId || !description) {
          return NextResponse.json({ error: 'userId et description requis' }, { status: 400 });
        }

        // Creer l'objectif
        const goal = orchestrator.createGoal(userId, description, priority || 'medium');

        // Lancer l'orchestration de maniere asynchrone
        // (ne pas await pour retourner immediatement)
        const executionPromise = orchestrator.executeOrchestration(goal.id);

        // Retourner l'objectif cree
        return NextResponse.json({
          success: true,
          goal: {
            id: goal.id,
            description: goal.description,
            priority: goal.priority,
            status: goal.status,
            createdAt: goal.createdAt,
          },
          message: 'Orchestration lancee. Utilise GET /api/code/orchestrate?goalId=' + goal.id + ' pour suivre la progression.',
          followUrl: '/api/code/orchestrate?goalId=' + goal.id,
        }, { status: 202 });
      }

      // Recuperer le statut d'une orchestration
      case 'status': {
        if (!goalId) {
          return NextResponse.json({ error: 'goalId requis' }, { status: 400 });
        }
        const goal = orchestrator.getGoal(goalId);
        if (!goal) {
          return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
        }
        return NextResponse.json({ goal });
      }

      // Recuperer le rapport complet
      case 'report': {
        if (!goalId) {
          return NextResponse.json({ error: 'goalId requis' }, { status: 400 });
        }
        const report = await orchestrator.getReport(goalId);
        if (!report) {
          return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }
        return NextResponse.json({ report });
      }

      // Lister les orchestrations d'un utilisateur
      case 'list': {
        if (!userId) {
          return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        }
        const goals = orchestrator.listGoals(userId);
        return NextResponse.json({
          goals: goals.map(g => ({
            id: g.id,
            description: g.description,
            priority: g.priority,
            status: g.status,
            createdAt: g.createdAt,
            completedAt: g.completedAt,
          })),
          total: goals.length,
        });
      }

      // Annuler une orchestration
      case 'cancel': {
        if (!goalId) {
          return NextResponse.json({ error: 'goalId requis' }, { status: 400 });
        }
        const canceled = orchestrator.cancelGoal(goalId);
        if (!canceled) {
          return NextResponse.json({ error: 'Impossible d\'annuler (deja termine ou introuvable)' }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: 'Orchestration annulee' });
      }

      // Stats globales
      case 'stats': {
        const stats = orchestrator.getStats();
        return NextResponse.json({ stats });
      }

      default:
        return NextResponse.json({
          error: 'Action non reconnue: ' + action,
          availableActions: ['start', 'status', 'report', 'list', 'cancel', 'stats'],
        }, { status: 400 });
    }
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de l\'orchestration',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get('goalId');
  const userId = searchParams.get('userId');

  if (goalId) {
    const report = await orchestrator.getReport(goalId);
    if (!report) {
      return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
    }
    return NextResponse.json({ report });
  }

  if (userId) {
    const goals = orchestrator.listGoals(userId);
    return NextResponse.json({ goals, total: goals.length });
  }

  return NextResponse.json({
    name: 'Orchestrator API',
    description: 'Deploie et coordonne plusieurs agents IA pour atteindre un objectif',
    version: '1.0.0',
    usage: 'POST /api/code/orchestrate avec action + parametres',
    actions: {
      start: 'Creer et lancer une orchestration (description requise)',
      status: 'Recuperer le statut d\'une orchestration (goalId requis)',
      report: 'Recuperer le rapport complet (goalId requis)',
      list: 'Lister les orchestrations (userId requis)',
      cancel: 'Annuler une orchestration (goalId requis)',
      stats: 'Stats globales de l\'orchestrateur',
    },
    roles: [
      { role: 'architect', name: 'Architecte', description: 'Concoit l\'architecture' },
      { role: 'code-writer', name: 'Code Writer', description: 'Ecrit le code' },
      { role: 'api-specialist', name: 'API Specialist', description: 'Cree les APIs' },
      { role: 'tester', name: 'Testeur', description: 'Ecrit les tests' },
      { role: 'debugger', name: 'Debugger', description: 'Corrige les bugs' },
      { role: 'deployer', name: 'Deployeur', description: 'Deploie en production' },
      { role: 'ux-designer', name: 'UX Designer', description: 'Concoit les interfaces' },
      { role: 'documenter', name: 'Documenteur', description: 'Cree la documentation' },
      { role: 'coordinator', name: 'Coordinateur', description: 'Coordonne les agents' },
    ],
  });
}