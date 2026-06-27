import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { handleMarketplaceCheckoutCompleted, handleStripeAccountUpdated } from '@/lib/marketplace/stripe-service';
import { createLogger } from '@/lib/logger';

const log = createLogger('marketplace-webhook');

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-01-27-ac' as any,
    });
  }
  return _stripe;
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const sig = request.headers.get('stripe-signature')!;
  const webhookSecret = process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: any) {
    log.error('Webhook signature verification failed', { error: err.message });
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  log.info('Marketplace webhook received', { type: event.type });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleMarketplaceCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'account.updated':
        await handleStripeAccountUpdated(event.data.object as Stripe.Account);
        break;
      default:
        log.info('Unhandled event type', { type: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    log.error('Error processing webhook', { type: event.type, error: err.message });
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
