// ============================================================
// GET /api/billing — Portail client self-service
// Abonnements, PAYG, factures, historique
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { paygService, PAYG_RATES } from '@/lib/payg-engine';

export const dynamic = "force-dynamic";
const log = createLogger('billing');

const PLANS = [
  { id: 'free', name: 'Gratuit', price: 0, priceUSD: 0, credits: 100, agents: 2, priceLabel: 'Gratuit', popular: false },
  { id: 'starter', name: 'Starter', price: 5000, priceUSD: 9.99, credits: 1000, agents: 5, priceLabel: '5 000 FCFA/mois', popular: false },
  { id: 'pro', name: 'Pro', price: 15000, priceUSD: 29.99, credits: 5000, agents: 20, priceLabel: '15 000 FCFA/mois', popular: true },
  { id: 'enterprise', name: 'Enterprise', price: 50000, priceUSD: 99.99, credits: -1, agents: -1, priceLabel: '50 000 FCFA/mois', popular: false },
];

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    // aggregate() est remplacé par une lecture + calcul en mémoire
    // (agentExecution, comme les autres modèles, est exposé par la façade Firestore).
    const since30d = new Date(Date.now() - 30 * 86400000);
    const [subscription, invoices, credits, executions, paygSummary] = await Promise.all([
      db.subscription.findUnique({ where: { userId: auth.userId } }),
      db.invoice.findMany({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 24,
      }),
      db.credit.findFirst({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        select: ['balance', 'used', 'total', 'expiresAt'],
      }),
      db.agentExecution.findMany({
        where: [
          { field: 'userId', op: '==', value: auth.userId },
          { field: 'createdAt', op: '>=', value: since30d },
        ],
      }),
      paygService.getUsageSummary(auth.userId),
    ]);

    // Calcul des agrégats en mémoire (remplace _sum / _count)
    const monthlyExecutions = executions.length;
    const totalCost = executions.reduce((sum: number, e) => sum + (Number(e.estimatedCost) || 0), 0);
    const totalTokens = executions.reduce((sum: number, e) => sum + (Number(e.totalTokens) || 0), 0);

    const res = NextResponse.json({
      success: true,
      data: {
        subscription: subscription || { plan: 'free', status: 'active' },
        invoices,
        credits: credits || { balance: 0, used: 0, total: 0, expiresAt: null },
        monthlyUsage: { executions: monthlyExecutions, totalCost, totalTokens },
        availablePlans: PLANS,
        payg: {
          rates: PAYG_RATES,
          balanceXAF: paygSummary.balanceXAF,
          today: paygSummary.today,
          thisMonth: paygSummary.thisMonth,
          byResource: paygSummary.byResource,
          alerts: paygSummary.alerts,
        },
        paymentMethod: { provider: 'Chariow', methods: ['Orange Money', 'MTN MoMo', 'Wave', 'Carte Bancaire'], currency: 'XAF' },
      },
    });

    return secureResponse(res, request);
  } catch (error) {
    log.error('billing_fetch_error', { error: String(error) });
    return secureResponse(NextResponse.json({ success: false, error: 'Erreur de chargement' }, { status: 500 }), request);
  }
}

/**
 * L'upsert de la façade ne supporte que `where: { id }` (années Prisma
exposaient upsert({ where: { userId } })). On bascule sur findFirst + update/create
pour rester compatible, avec un identifiant auto-généré via create().
 */
async function setSubscription(userId: string, plan: string, status: string, extra: Record<string, unknown> = {}, onExisting?: Record<string, unknown>) {
  const existing = await db.subscription.findFirst({
    where: [{ field: 'userId', op: '==', value: userId }],
  });
  if (existing && existing.id) {
    await db.subscription.update({
      where: { id: existing.id as string },
      data: { plan, status, ...extra },
    });
    return;
  }
  const createData = onExisting || {
    userId,
    plan,
    status,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    ...extra,
  };
  await db.subscription.create({ data: createData });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { action, planId, amountXAF, phone, operator } = body;

    switch (action) {
      case 'change_plan':
        if (!planId) return NextResponse.json({ error: 'planId requis' }, { status: 400 });
        await setSubscription(auth.userId, planId, 'active', {});
        await db.user.update({ where: { id: auth.userId }, data: { plan: planId } });
        return NextResponse.json({ success: true, message: `Plan changé pour ${planId}` });

      case 'top_up':
        if (!amountXAF || !phone || !operator) return NextResponse.json({ error: 'amountXAF, phone et operator requis' }, { status: 400 });
        const result = await paygService.topUp({ userId: auth.userId, amountXAF, phone, operator });
        return NextResponse.json(result);

      case 'cancel_subscription':
        await setSubscription(auth.userId, 'free', 'canceled', { cancelAtPeriodEnd: true });
        await db.user.update({ where: { id: auth.userId }, data: { plan: 'free' } });
        return NextResponse.json({ success: true, message: 'Abonnement résilié' });

      default:
        return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
    }
  } catch (error) {
    log.error('billing_action_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
