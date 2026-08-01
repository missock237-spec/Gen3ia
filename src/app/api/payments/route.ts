// Payments API — Paiements via SubPay (MTN MoMo, Orange Money, Wave, etc.)
// SECURITE: applySecurity + ownership + rate limit Redis (paiements = opérations sensibles)

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { subpay } from '@/lib/payment/subpay';
import { rateLimit } from '@/lib/rate-limiter';

const log = createLogger('payments');

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Rate limit strict : max 5 tentatives de paiement/min (anti-spam/anti-fraude)
  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de tentatives de paiement' }, { status: 429 });

  try {
    const body = await request.json();
    const { amount, currency, provider, phone } = body;

    if (!amount || !provider || !phone) {
      return NextResponse.json({ error: 'amount, provider et phone requis' }, { status: 400 });
    }

    if (!subpay.isConfigured()) {
      return NextResponse.json({ error: 'SubPay non configure' }, { status: 503 });
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum < 100) {
      return NextResponse.json({ error: 'Montant invalide (min 100)' }, { status: 400 });
    }

    if (amountNum > 5000000) {
      return NextResponse.json({ error: 'Montant trop eleve (max 5 000 000)' }, { status: 400 });
    }

    const reference = `genova_${auth.userId.slice(0, 8)}_${Date.now()}`;

    await db.invoice.create({
      data: {
        userId: auth.userId,
        amount: amountNum,
        currency: currency || 'XAF',
        status: 'pending',
        paymentMethod: 'subpay_' + provider,
        reference,
      },
    });

    const transaction = await subpay.initiatePayment({
      amount: amountNum,
      currency: currency || 'XAF',
      provider,
      phone,
      reference,
      metadata: { userId: auth.userId },
    });

    log.info('payment_initiated', { userId: auth.userId, amount: amountNum, provider });

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
      reference,
      status: transaction.status,
      redirectUrl: transaction.redirectUrl,
    });
  } catch (error) {
    log.error('payment_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de paiement' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const invoices = await db.invoice.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const providers = await subpay.getAvailableProviders();

    return NextResponse.json({ success: true, data: { invoices, providers } });
  } catch (error) {
    log.error('payments_list_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
