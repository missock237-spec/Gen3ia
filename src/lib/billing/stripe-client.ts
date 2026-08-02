/**
 * SEBPAY CLIENT — Service de paiement africain (Mobile Money, Carte Bancaire)
 * Remplace Stripe. Paiements via Orange Money, MTN MoMo, Wave, etc.
 * Vérification d'identité simplifiée.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { sebpay } from '@/lib/sebpay';

const log = createLogger('sebpay-client');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  userId: string;
  planId: string;
  successUrl?: string;
  cancelUrl?: string;
  /** Phone number for Mobile Money payment */
  phone?: string;
  /** Operator: ORANGE_MONEY | MTN_MOMO | WAVE | CARTE_BANCAIRE */
  operator?: string;
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
}

// ---------------------------------------------------------------------------
// Méthodes principales
// ---------------------------------------------------------------------------

/**
 * Crée une session de checkout SebPay
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<{
  sessionId: string;
  url: string;
}> {
  const { userId, planId, successUrl, cancelUrl, phone, operator } = input;

  const { SUBSCRIPTION_PLANS } = await import('./sebpay-client');
  const plan = SUBSCRIPTION_PLANS.find((p: { id: string }) => p.id === planId);

  if (!plan) {
    throw new Error(`Plan introuvable: ${planId}`);
  }

  const reference = `gen3ia_${userId.slice(0, 8)}_${Date.now()}`;

  // Paiement via Mobile Money ou Carte Bancaire
  const paymentResult = await sebpay.initiatePayment({
    amount: plan.price,
    currency: 'XAF',
    phone: phone || '',
    operator: operator || 'ORANGE_MONEY',
    description: `Abonnement ${plan.name} - Gen3ia`,
    reference,
    callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook`,
  });

  if (!paymentResult.success) {
    throw new Error(paymentResult.message || 'Erreur de paiement SebPay');
  }

  log.info('Checkout session created', {
    userId,
    sessionId: paymentResult.transactionId,
    planId,
    operator,
  });

  return {
    sessionId: paymentResult.transactionId || reference,
    url: paymentResult.paymentUrl || `${successUrl || process.env.NEXT_PUBLIC_APP_URL}?checkout=success&ref=${reference}`,
  };
}

/**
 * Vérifie le statut d'un paiement SebPay
 */
export async function getPaymentStatus(transactionId: string): Promise<{
  status: string;
  success: boolean;
}> {
  const result = await sebpay.checkPaymentStatus(transactionId);
  return {
    status: result.status || 'unknown',
    success: result.success,
  };
}

/**
 * Gère le webhook SebPay
 */
export async function handleWebhook(
  payload: any,
  signature: string
): Promise<{ received: boolean; event?: string }> {
  const isValid = sebpay.verifyWebhookSignature(
    typeof payload === 'string' ? payload : JSON.stringify(payload),
    signature
  );

  if (!isValid) {
    log.error('Webhook signature verification failed');
    throw new Error('Invalid webhook signature');
  }

  log.info('Webhook received', { event: payload.event, transactionId: payload.transaction_id });

  await sebpay.handleWebhook(payload);

  return { received: true, event: payload.event };
}

/**
 * Récupère les infos d'abonnement
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
  };
}

/**
 * Plans tarifaires disponibles via SebPay
 */
export const SUBSCRIPTION_PLANS = [
  { id: 'free', name: 'Gratuit', price: 0, priceUSD: 0, credits: 100, maxAgents: 2, features: ['2 agents IA', '100 crédits/mois', 'Outils de base', 'Support communautaire'] },
  { id: 'starter', name: 'Starter', price: 5000, priceUSD: 9.99, credits: 1000, maxAgents: 5, features: ['5 agents IA', '1000 crédits/mois', 'Tous les outils', 'Support email'] },
  { id: 'pro', name: 'Pro', price: 15000, priceUSD: 29.99, credits: 5000, maxAgents: 20, features: ['20 agents IA', '5000 crédits/mois', 'Outils avancés', 'Support prioritaire'], popular: true },
  { id: 'enterprise', name: 'Enterprise', price: 50000, priceUSD: 99.99, credits: -1, maxAgents: -1, features: ['Agents illimités', 'Crédits illimités', 'Support dédié', 'SLA garanti'] },
];

/**
 * Crée une session de portail de gestion d'abonnement
 */
export async function createPortalSession(input: PortalSessionInput): Promise<{ url: string }> {
  const { userId, returnUrl } = input;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const portalUrl = `${baseUrl}/billing/portal?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl || baseUrl)}`;
  return { url: portalUrl };
}
