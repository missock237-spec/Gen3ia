// ============================================================
// POST /api/billing/purchase-credits — Achat de crédits via SebPay
// Paiement Mobile Money Afrique (Orange Money, MTN MoMo, Wave)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { sebpay, SUBSCRIPTION_PLANS } from '@/lib/sebpay';





export const dynamic = "force-dynamic";
const CREDIT_PACKS = [
  { id: 'credits_100', credits: 100, price: 2500, currency: 'XAF', label: '100 credits', priceLabel: '2 500 FCFA' },
  { id: 'credits_500', credits: 500, price: 10000, currency: 'XAF', label: '500 credits', priceLabel: '10 000 FCFA' },
  { id: 'credits_1000', credits: 1000, price: 15000, currency: 'XAF', label: '1 000 credits', priceLabel: '15 000 FCFA' },
  { id: 'credits_2500', credits: 2500, price: 30000, currency: 'XAF', label: '2 500 credits', priceLabel: '30 000 FCFA' },
  { id: 'credits_5000', credits: 5000, price: 50000, currency: 'XAF', label: '5 000 credits', priceLabel: '50 000 FCFA' },
  { id: 'credits_10000', credits: 10000, price: 80000, currency: 'XAF', label: '10 000 credits', priceLabel: '80 000 FCFA' },
  { id: 'credits_25000', credits: 25000, price: 175000, currency: 'XAF', label: '25 000 credits', priceLabel: '175 000 FCFA' },
  { id: 'credits_50000', credits: 50000, price: 300000, currency: 'XAF', label: '50 000 credits', priceLabel: '300 000 FCFA' },
  { id: 'credits_100000', credits: 100000, price: 500000, currency: 'XAF', label: '100 000 credits', priceLabel: '500 000 FCFA' },
];

export async function GET() {
  return NextResponse.json({ packs: CREDIT_PACKS });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { packId, phone, operator } = await request.json();

    const pack = CREDIT_PACKS.find(p => p.id === packId);
    if (!pack) {
      return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });
    }

    const reference = `gen3ia_${session.user.id.slice(0, 8)}_${Date.now()}`;

    // Paiement via SebPay (Mobile Money)
    const payment = await sebpay.initiatePayment({
      amount: pack.price,
      currency: 'XAF',
      phone: phone || '',
      operator: operator || 'ORANGE_MONEY',
      description: `Achat de ${pack.credits} credits - Gen3ia`,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/webhook`,
    });

    if (!payment.success) {
      return NextResponse.json({ error: payment.message || 'Erreur de paiement' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: payment.paymentUrl,
      transactionId: payment.transactionId,
      reference,
      message: `Paiement de ${pack.priceLabel} initie. ${payment.paymentUrl ? 'Redirection vers SebPay...' : 'Suivez les instructions sur votre telephone.'}`,
    });
  } catch (error) {
    console.error('Purchase credits error:', error);
    return NextResponse.json({ error: 'Erreur paiement SebPay' }, { status: 500 });
  }
}
