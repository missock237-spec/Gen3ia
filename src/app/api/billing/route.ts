// ============================================================
// GET /api/billing — Portail client self-service
// Abonnements, PAYG, factures, historique
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { paygService, PAYG_RATES } from '@/lib/payg-engine';

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
    const [subscription, invoices, credits, usage, paygSummary] = await Promise.all([
      db.subscription.findUnique({ where: { userId: auth.userId } }),
      db.invoice.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: 'desc' }, take: 24 }),
      db.credit.findFirst({ where: { userId: auth.userId }, select: { balance: true, used: true, total: true, expiresAt: true } }),
      db.agentExecution.aggregate({ where: { userId: auth.userId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _sum: { estimatedCost: true, totalTokens: true }, _count: { id: true } }),
      paygService.getUsageSummary(auth.userId),
    ]);

    const res = NextResponse.json({
      success: true,
      data: {
        subscription: subscription || { plan: 'free', status: 'active' },
        invoices,
        credits: credits || { balance: 0, used: 0, total: 0, expiresAt: null },
        monthlyUsage: { executions: usage._count.id, totalCost: usage._sum?.estimatedCost || 0, totalTokens: usage._sum?.totalTokens || 0 },
        availablePlans: PLANS,
        payg: {
          rates: PAYG_RATES,
          balanceXAF: paygSummary.balanceXAF,
          today: paygSummary.today,
          thisMonth: paygSummary.thisMonth,
          byResource: paygSummary.byResource,
          alerts: paygSummary.alerts,
        },
        paymentMethod: { provider: 'SebPay', methods: ['Orange Money', 'MTN MoMo', 'Wave', 'Carte Bancaire'], currency: 'XAF' },
      },
    });

    return secureResponse(res, request);
  } catch (error) {
    log.error('billing_fetch_error', { error: String(error) });
    return secureResponse(NextResponse.json({ success: false, error: 'Erreur de chargement' }, { status: 500 }), request);
  }
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
        await db.subscription.upsert({
          where: { userId: auth.userId },
          create: { userId: auth.userId, plan: planId, status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000) },
          update: { plan: planId, status: 'active' },
        });
        await db.user.update({ where: { id: auth.userId }, data: { plan: planId } });
        return NextResponse.json({ success: true, message: `Plan changé pour ${planId}` });

      case 'top_up':
        if (!amountXAF || !phone || !operator) return NextResponse.json({ error: 'amountXAF, phone et operator requis' }, { status: 400 });
        const result = await paygService.topUp({ userId: auth.userId, amountXAF, phone, operator });
        return NextResponse.json(result);

      case 'cancel_subscription':
        await db.subscription.upsert({
          where: { userId: auth.userId },
          create: { userId: auth.userId, plan: 'free', status: 'canceled' },
          update: { status: 'canceled', cancelAtPeriodEnd: true },
        });
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
