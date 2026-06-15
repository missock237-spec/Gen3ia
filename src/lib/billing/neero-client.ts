/**
 * Neero Integration — Payment Processing & Subscription Management
 *
 * Handles checkout sessions, webhooks, and subscription lifecycle management via Neero API.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('neero-client');

const NEERO_API_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.neero.tech/payment-gateway'
  : 'https://api.dev.neero.io/payment-gateway';

const NEERO_API_KEY = process.env.NEERO_API_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  userId: string;
  priceId: string;
  planId: string;
  successUrl?: string;
  cancelUrl?: string;
  mode?: 'payment' | 'subscription';
}

export interface NeeroSessionResponse {
  id: string;
  url: string;
}

export interface PortalSessionInput {
  userId: string;
  returnUrl?: string;
}

export interface SubscriptionInfo {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  neeroCustomerId: string | null;
  neeroSubscriptionId: string | null;
}

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

async function neeroRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!NEERO_API_KEY) {
    throw new Error('NEERO_API_KEY is not set');
  }

  const response = await fetch(`${NEERO_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${NEERO_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Neero API error: ${error.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Create a Neero Checkout Session
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<{
  sessionId: string;
  url: string;
}> {
  const { userId, priceId, planId, successUrl, cancelUrl, mode } = input;

  log.info('Creating Neero checkout session', { userId, planId });

  const session = await neeroRequest<NeeroSessionResponse>('/api/v1/transaction-intent-session', {
    method: 'POST',
    body: JSON.stringify({
      amount: await getPriceAmount(priceId),
      currency: 'XAF',
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/?checkout=success`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/?checkout=cancel`,
      metadata: {
        userId,
        planId,
        mode: mode || 'subscription'
      }
    }),
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Neero doesn't seem to have a direct equivalent of a Customer Portal
 * in the public docs, so we return a placeholder or link to account settings.
 */
export async function createPortalSession(input: PortalSessionInput): Promise<{ url: string }> {
  return {
    url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  };
}

/**
 * Handle Neero Webhook Events
 */
export async function handleWebhook(
  payload: any
): Promise<{ received: boolean; event?: string }> {
  const event = payload.event || payload.type;
  log.info('Neero webhook received', { event, id: payload.id });

  switch (event) {
    case 'transaction.success':
      await handlePaymentSuccess(payload.data || payload);
      break;
    case 'subscription.created':
      await handleSubscriptionCreated(payload.data || payload);
      break;
  }

  return { received: true, event };
}

async function handlePaymentSuccess(data: any): Promise<void> {
  const { userId, planId, mode, creditAmount } = data.metadata || {};

  if (mode === 'payment' && userId && creditAmount) {
    const { addCredits } = await import('./credits');
    await addCredits({
      userId,
      amount: parseInt(creditAmount),
      type: 'purchase',
      resourceType: 'credit_purchase',
      description: `Achat de ${creditAmount} crédits via Neero`,
    });
  }
}

async function handleSubscriptionCreated(data: any): Promise<void> {
  const { userId, planId } = data.metadata || {};
  if (!userId) return;

  await db.subscription.upsert({
    where: { neeroSubscriptionId: data.id },
    create: {
      userId,
      plan: planId || 'free',
      neeroCustomerId: data.customer_id,
      neeroSubscriptionId: data.id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      plan: planId || 'free',
      status: 'active',
    }
  });

  const { addCredits } = await import('./credits');
  const { PLAN_CREDITS } = await import('./plans');
  const credits = PLAN_CREDITS[planId] || 0;
  if (credits > 0) {
    await addCredits({
      userId,
      amount: credits,
      type: 'bonus',
      resourceType: 'plan_upgrade',
      description: `Crédits du plan ${planId}`,
    });
  }
}

/**
 * Get subscription information for a user
 */
export async function getSubscription(userId: string): Promise<SubscriptionInfo | null> {
  const subscription = await db.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (!subscription) return null;

  return {
    id: subscription.id,
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    neeroCustomerId: subscription.neeroCustomerId,
    neeroSubscriptionId: subscription.neeroSubscriptionId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getPriceAmount(priceId: string): Promise<number> {
  const { PLANS, CREDIT_PACKAGES } = await import('./plans');
  const plan = PLANS.find(p => p.neeroPriceId === priceId);
  if (plan) return plan.price;

  const pkg = CREDIT_PACKAGES.find(p => p.neeroPriceId === priceId);
  if (pkg) return pkg.price;

  return 0;
}
