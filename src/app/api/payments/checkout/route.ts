// ============================================================
// POST /api/payments/checkout — Initie un paiement via SebPay
// Supporte: Orange Money, MTN MoMo, Wave, Carte Bancaire
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';
import { sebpay } from '@/lib/sebpay';
import { createLogger } from '@/lib/logger';

const JWT_SECRET = process.env.AUTH_SECRET;
const log = createLogger('checkout');

const PLAN_PRICES: Record<string, { price: number; credits: number; name: string }> = {
  free: { price: 0, credits: 100, name: 'Gratuit' },
  starter: { price: 5000, credits: 1000, name: 'Starter' },
  pro: { price: 15000, credits: 5000, name: 'Pro' },
  enterprise: { price: 50000, credits: 25000, name: 'Enterprise' },
};

const CREDIT_PACKS: Record<string, { credits: number; price: number; name: string }> = {
  small: { credits: 500, price: 2500, name: 'Pack 500 crédits' },
  medium: { credits: 2000, price: 8000, name: 'Pack 2000 crédits' },
  large: { credits: 5000, price: 18000, name: 'Pack 5000 crédits' },
  xlarge: { credits: 15000, price: 45000, name: 'Pack 15000 crédits' },
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = verify(token, JWT_SECRET) as { userId: string };

    const { type, id, phone, operator } = await request.json();

    if (!type || !id) {
      return NextResponse.json({ error: 'Type et ID requis' }, { status: 400 });
    }

    // === ACHAT DE PLAN ===
    if (type === 'plan') {
      const plan = PLAN_PRICES[id];
      if (!plan) {
        return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });
      }

      // Plan gratuit - activation directe
      if (plan.price === 0) {
        await db.user.update({
          where: { id: decoded.userId },
          data: { plan: id },
        });
        await db.creditTransaction.create({
          data: {
            userId: decoded.userId,
            type: 'bonus',
            amount: plan.credits,
            description: `Plan ${plan.name} activé`,
          },
        });
        return NextResponse.json({ success: true, message: `Plan ${plan.name} activé !` });
      }

      // Paiement via SebPay
      const reference = `gen3ia_${decoded.userId.slice(0, 8)}_${Date.now()}`;
      const payment = await sebpay.initiatePayment({
        amount: plan.price,
        currency: 'XAF',
        phone: phone || '',
        operator: operator || 'ORANGE_MONEY',
        description: `Abonnement ${plan.name} - Gen3ia`,
        reference,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/webhook`,
      });

      if (!payment.success) {
        return NextResponse.json({ error: payment.message || 'Erreur de paiement' }, { status: 500 });
      }

      log.info('checkout_plan_initiated', { userId: decoded.userId, plan: id, transactionId: payment.transactionId });

      return NextResponse.json({
        url: payment.paymentUrl || `/billing?checkout=plan_${id}&ref=${reference}`,
        transactionId: payment.transactionId,
        reference,
        success: true,
        message: `Paiement de ${plan.price} FCFA initié. ${payment.paymentUrl ? 'Redirection...' : 'Vérifiez votre téléphone.'}`,
      });
    }

    // === ACHAT DE CRÉDITS ===
    if (type === 'credits') {
      const pack = CREDIT_PACKS[id];
      if (!pack) {
        return NextResponse.json({ error: 'Pack de crédits invalide' }, { status: 400 });
      }

      const reference = `gen3ia_cred_${decoded.userId.slice(0, 8)}_${Date.now()}`;
      const payment = await sebpay.initiatePayment({
        amount: pack.price,
        currency: 'XAF',
        phone: phone || '',
        operator: operator || 'ORANGE_MONEY',
        description: pack.name,
        reference,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/webhook`,
      });

      if (!payment.success) {
        return NextResponse.json({ error: payment.message || 'Erreur de paiement' }, { status: 500 });
      }

      // Créer une transaction en attente
      await db.creditTransaction.create({
        data: {
          userId: decoded.userId,
          type: 'pending',
          amount: pack.credits,
          description: `${pack.name} (${pack.price} FCFA) - En attente de confirmation`,
          reference,
        },
      });

      log.info('checkout_credits_initiated', { userId: decoded.userId, pack: id, transactionId: payment.transactionId });

      return NextResponse.json({
        url: payment.paymentUrl || `/billing?checkout=credits_${id}&ref=${reference}`,
        transactionId: payment.transactionId,
        reference,
        success: true,
        message: `Paiement de ${pack.price} FCFA initié pour ${pack.credits} crédits.`,
      });
    }

    return NextResponse.json({ error: 'Type de transaction invalide' }, { status: 400 });
  } catch (error) {
    log.error('checkout_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de paiement' }, { status: 500 });
  }
}
