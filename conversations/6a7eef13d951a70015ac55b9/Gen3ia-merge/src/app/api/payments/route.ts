// Payments API — Paiements via Chariow (MTN MoMo, Orange Money, Wave, Carte, etc.)
// SECURITE: applySecurity + ownership + rate limit Redis (paiements = opérations sensibles)

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { chariow } from '@/lib/payment/chariow';
import { rateLimit } from '@/lib/rate-limiter';

export const dynamic = "force-dynamic";
const log = createLogger('payments');

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Rate limit strict : max 5 tentatives de paiement/min (anti-spam/anti-fraude)
  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de tentatives de paiement' }, { status: 429 });

  try {
    const body = await request.json();
    const { productId, amount, currency, phone } = body;

    if (!productId || !amount) {
      return NextResponse.json({ error: 'productId et amount requis' }, { status: 400 });
    }

    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: 'Chariow non configuré' }, { status: 503 });
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum < 100) {
      return NextResponse.json({ error: 'Montant invalide (min 100)' }, { status: 400 });
    }

    if (amountNum > 5000000) {
      return NextResponse.json({ error: 'Montant trop élevé (max 5 000 000)' }, { status: 400 });
    }

    const reference = `genova_${auth.userId.slice(0, 8)}_${Date.now()}`;

    await db.invoice.create({
      data: {
        userId: auth.userId,
        amount: amountNum,
        currency: currency || 'XAF',
        status: 'pending',
        paymentMethod: 'chariow',
        reference,
      },
    });

    const checkout = await chariow.initiateCheckout({
      productId,
      metadata: {
        userId: auth.userId,
        type: 'payment',
        amount: String(amountNum),
        currency: currency || 'XAF',
        reference,
      },
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing?checkout=success&ref=${reference}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing`,
    });

    log.info('payment_initiated', { userId: auth.userId, amount: amountNum });

    return NextResponse.json({
      success: true,
      transactionId: checkout.saleId || reference,
      reference,
      status: checkout.step === 'payment' ? 'pending' : checkout.step,
      redirectUrl: checkout.checkoutUrl,
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
    // Facade Firestore : where/orderBy en tableaux FirestoreWhereOp[]/FirestoreOrderBy[], limit au lieu de take.
    const invoices = await db.invoice.findMany({
      where: [{ field: 'userId', op: '==', value: auth.userId }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 20,
    });

    return NextResponse.json({ success: true, data: { invoices, provider: 'chariow' } });
  } catch (error) {
    log.error('payments_list_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
