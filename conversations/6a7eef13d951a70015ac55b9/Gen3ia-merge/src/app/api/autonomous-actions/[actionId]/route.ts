// ============================================================
// API Route: /api/autonomous-actions/[actionId]
// Opérations sur une action spécifique (approver, annuler, détails)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type RouteContext } from '@/lib/with-auth';
import { prisma } from '@/lib/prisma';
import { getAutonomousActionEngine } from '@/lib/saas-automation/action-engine';

// GET /api/autonomous-actions/[actionId] — Détails d'une action
export const GET = withAuth(async (req, ctx, auth) => {
  try {
    const params = await ctx.params;
// @ts-ignore
    const actionId = params.actionId;

    const action = await prisma.autonomousAction.findFirst({
      where: { id: actionId, userId: auth.userId },
      include: {
        saasAccount: { select: { id: true, provider: true, label: true, accountEmail: true } },
        agent: { select: { id: true, name: true } },
        audits: { orderBy: { timestamp: 'desc' }, take: 20 },
      },
    });

    if (!action) {
      return NextResponse.json({ error: 'Action non trouvée' }, { status: 404 });
    }

    return NextResponse.json({ action });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'action', details: String(error) },
      { status: 500 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 60, windowMs: 60000 } });

// PATCH /api/autonomous-actions/[actionId] — Approuver ou annuler
export const PATCH = withAuth(async (req, ctx, auth) => {
  try {
    const params = await ctx.params;
// @ts-ignore
    const actionId = params.actionId;
    const body = await req.json();
    const engine = getAutonomousActionEngine();

    if (body.action === 'approve') {
// @ts-ignore
      const result = await engine.approveAction(actionId, auth.userId);
      return NextResponse.json(result);
    }

    if (body.action === 'cancel') {
// @ts-ignore
      await engine.cancelAction(actionId, auth.userId);
      return NextResponse.json({ message: 'Action annulée' });
    }

    return NextResponse.json({ error: 'Action non reconnue (approve|cancel)' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 30, windowMs: 60000 } });
