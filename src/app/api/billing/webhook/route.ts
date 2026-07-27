import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature || !webhookSecret) {
      return NextResponse.json({ error: 'Webhook non configure' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-02-24.acacia' });
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const credits = parseInt(session.metadata?.credits || '0');

      if (!userId || credits <= 0) {
        return NextResponse.json({ error: 'Metadata invalide' }, { status: 400 });
      }

      // Recuperer le solde actuel
      const lastTx = await prisma.creditTransaction.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      const currentBalance = lastTx?.balance || 0;
      const newBalance = currentBalance + credits;

      // Creer la transaction
      await prisma.creditTransaction.create({
        data: {
          userId,
          amount: credits,
          balance: newBalance,
          type: 'purchase',
          resourceType: 'stripe_payment',
          resourceId: session.id,
          description: 'Achat de ' + credits + ' credits (Stripe)',
          metadata: JSON.stringify({
            stripeSessionId: session.id,
            amountTotal: session.amount_total,
            currency: session.currency,
            paymentStatus: session.payment_status,
          }),
        },
      });

      // Mettre a jour ou creer l'abonnement
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: 'pro',
          status: 'active',
          stripeCustomerId: session.customer as string || undefined,
          stripeSubscriptionId: session.subscription as string || undefined,
        },
        update: {
          plan: 'pro',
          status: 'active',
        },
      });

      // Logger l'evenement
      await prisma.activityLog.create({
        data: {
          action: 'CREDITS_PURCHASED',
          details: JSON.stringify({ credits, amount: session.amount_total, stripeSessionId: session.id }),
          category: 'billing',
          userId,
        },
      });
    }

    if (event.type === 'checkout.session.expired') {
      console.log('[Stripe] Session expiree:', (event.data.object as Stripe.Checkout.Session).id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Erreur:', error);
    return NextResponse.json({ error: 'Erreur webhook' }, { status: 500 });
  }
}
