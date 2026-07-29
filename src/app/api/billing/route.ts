// ============================================================
// GET /api/billing — Informations de facturation
// Paiement via SebPay (Mobile Money Afrique)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const log = createLogger('billing');

const AVAILABLE_PLANS = [
  { id: 'free', name: 'Gratuit', price: 0, credits: 100, priceLabel: 'Gratuit' },
  { id: 'starter', name: 'Starter', price: 5000, credits: 1000, priceLabel: '5 000 FCFA/mois' },
  { id: 'pro', name: 'Pro', price: 15000, credits: 5000, priceLabel: '15 000 FCFA/mois' },
  { id: 'enterprise', name: 'Enterprise', price: 50000, credits: 25000, priceLabel: '50 000 FCFA/mois' },
];

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  try {
    const [subscription, invoices, creditTransactions, credits, usage] = await Promise.all([
      db.subscription.findUnique({ where: { userId: auth.userId } }),
      db.invoice.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      db.creditTransaction.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.credit.findFirst({
        where: { userId: auth.userId },
        select: { balance: true, used: true, total: true, expiresAt: true },
      }),
      db.agentExecution.aggregate({
        where: {
          userId: auth.userId,
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        _sum: { estimatedCost: true, totalTokens: true },
        _count: { id: true },
      }),
    ]);

    const res = NextResponse.json({
      success: true,
      data: {
        subscription,
        invoices,
        creditTransactions,
        credits: credits || { balance: 0, used: 0, total: 0, expiresAt: null },
        monthlyUsage: {
          executions: usage._count.id,
          totalCost: usage._sum?.estimatedCost || 0,
          totalTokens: usage._sum?.totalTokens || 0,
        },
        availablePlans: AVAILABLE_PLANS,
        paymentMethod: {
          provider: 'SebPay',
          methods: ['Orange Money', 'MTN MoMo', 'Wave', 'Carte Bancaire'],
          currency: 'XAF',
        },
      },
    });

    return secureResponse(res, request);
  } catch (error) {
    log.error('billing_fetch_error', { error: String(error) });
    const res = NextResponse.json({ success: false, error: 'Erreur de chargement' }, { status: 500 });
    return secureResponse(res, request);
  }
}
