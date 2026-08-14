// ============================================================
// API Route: /api/autonomous-actions
// Exécution et gestion des actions autonomes
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getAutonomousActionEngine } from '@/lib/saas-automation/action-engine';
import { prisma } from '@/lib/prisma';

// GET /api/autonomous-actions — Historique des actions + métriques
export const GET = withAuth(async (req, _ctx, auth) => {
  try {
    const url = new URL(req.url);
    const engine = getAutonomousActionEngine();

    // Si ?metrics=true, retourner les métriques
    if (url.searchParams.get('metrics') === 'true') {
      const metrics = await engine.getMetrics(auth.userId);
      return NextResponse.json({ metrics });
    }

    // Sinon, retourner l'historique
    const history = await engine.getActionHistory(auth.userId, {
      status: url.searchParams.get('status') || undefined,
      provider: url.searchParams.get('provider') || undefined,
      agentId: url.searchParams.get('agentId') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
    });

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des actions', details: String(error) },
      { status: 500 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 60, windowMs: 60000 } });

// POST /api/autonomous-actions — Exécuter une action autonome
export const POST = withAuth(async (req, _ctx, auth) => {
  try {
    const body = await req.json();
    const engine = getAutonomousActionEngine();

    // Exécution d'une action composée
    if (body.composed && body.steps) {
      const result = await engine.executeComposedAction({
        userId: auth.userId,
        agentId: body.agentId,
        name: body.name || 'Composed action',
        steps: body.steps,
        failureStrategy: body.failureStrategy || 'abort',
      });

      return NextResponse.json(result);
    }

    // Exécution d'une action simple
    const result = await engine.executeAction({
      userId: auth.userId,
      agentId: body.agentId,
      saasAccountId: body.saasAccountId,
      operation: body.operation,
      inputParams: body.inputParams || {},
      options: {
        templateId: body.templateId,
        riskLevel: body.riskLevel,
        executionMode: body.executionMode,
        timeoutMs: body.timeoutMs,
        maxRetries: body.maxRetries,
        agentConfidence: body.agentConfidence,
        screenshotBefore: body.screenshotBefore,
        screenshotAfter: body.screenshotAfter,
      },
    });

    const statusCode = result.status === 'completed' ? 200
      : result.status === 'consent_required' ? 202
      : result.status === 'failed' ? 500
      : 400;

    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de l\'exécution de l\'action', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 20, windowMs: 60000 }, quota: true });

// PATCH /api/autonomous-actions — Approuver/Annuler une action
export const PATCH = withAuth(async (req, _ctx, auth) => {
  try {
    const body = await req.json();
    const engine = getAutonomousActionEngine();

    if (body.action === 'approve') {
      const result = await engine.approveAction(body.actionId, auth.userId);
      return NextResponse.json(result);
    }

    if (body.action === 'cancel') {
      await engine.cancelAction(body.actionId, auth.userId);
      return NextResponse.json({ message: 'Action annulée' });
    }

    return NextResponse.json({ error: 'Action non reconnue (approve|cancel)' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'action', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 30, windowMs: 60000 } });
