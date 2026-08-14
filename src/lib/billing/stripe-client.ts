/**
 * CHARIOW CLIENT ADAPTER — Paiement numérique (Mobile Money Afrique + Carte)
 * Remplace Stripe et SebPay. Paiements via Orange Money, MTN MoMo, Wave, Carte.
 * Vérification d'identité simplifiée via Chariow.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { chariow } from '@/lib/payment/chariow';

const log = createLogger('chariow-client');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSessionInput {
  userId: string;
  planId: string;
  successUrl?: string;
  cancelUrl?: string;
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

/**
 * Plans tarifaires disponibles via Chariow
 */
export const SUBSCRIPTION_PLANS = [
  { id: 'free', name: 'Gratuit', price: 0, priceUSD: 0, credits: 100, maxAgents: 2, features: ['2 agents IA', '100 crédits/mois', 'Outils de base', 'Support communautaire'] },
  { id: 'starter', name: 'Starter', price: 5000, priceUSD: 9.99, credits: 1000, maxAgents: 5, features: ['5 agents IA', '1000 crédits/mois', 'Tous les outils', 'Support email'] },
  { id: 'pro', name: 'Pro', price: 15000, priceUSD: 29.99, credits: 5000, maxAgents: 20, features: ['20 agents IA', '5000 crédits/mois', 'Outils avancés', 'Support prioritaire'], popular: true },
  { id: 'enterprise', name: 'Enterprise', price: 50000, priceUSD: 99.99, credits: -1, maxAgents: -1, features: ['Agents illimités', 'Crédits illimités', 'Support dédié', 'SLA garanti'] },
];

// ---------------------------------------------------------------------------
// Méthodes principales
// ---------------------------------------------------------------------------

/**
 * Crée une session de checkout Chariow
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<{
  sessionId: string;
  url: string;
}> {
  const { userId, planId, successUrl, cancelUrl } = input;

  const plan = SUBSCRIPTION_PLANS.find((p: { id: string }) => p.id === planId);
  if (!plan) {
    throw new Error(`Plan introuvable: ${planId}`);
  }

  if (!chariow.isConfigured()) {
    throw new Error('Chariow non configuré. Définissez CHARIOW_API_KEY.');
  }

  const productId = process.env[`CHARIOW_PRODUCT_PLAN_${planId.toUpperCase()}`] || '';
  if (!productId) {
    throw new Error(`Produit Chariow non configuré pour le plan ${planId}.`);
  }

  const reference = `gen3ia_${userId.slice(0, 8)}_${Date.now()}`;

  const checkout = await chariow.initiateCheckout({
    productId,
    metadata: { userId, type: 'plan', planId, credits: String(plan.credits) },
    successUrl: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=success&ref=${reference}`,
    cancelUrl: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });

  log.info('Checkout session created', { userId, sessionId: checkout.saleId, planId });

  return {
    sessionId: checkout.saleId || reference,
    url: checkout.checkoutUrl || successUrl || `${process.env.NEXT_PUBLIC_APP_URL}?checkout=success&ref=${reference}`,
  };
}

/**
 * Vérifie le statut d'un paiement Chariow
 */
export async function getPaymentStatus(transactionId: string): Promise<{
  status: string;
  success: boolean;
}> {
  const { status } = await chariow.getSaleStatus(transactionId);
  return { status, success: status === 'completed' };
}

/**
 * Gère le webhook Chariow
 */
export async function handleWebhook(
  payload: any,
  signature: string
): Promise<{ received: boolean; event?: string }> {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const isValid = chariow.verifyWebhookSignature(raw, signature);

  if (!isValid) {
    log.error('Webhook signature verification failed');
    throw new Error('Invalid webhook signature');
  }

  log.info('Webhook received', { event: payload.event });
  await chariow.handleWebhook(payload);

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
 * Crée une session de portail de gestion d'abonnement
 */
export async function createPortalSession(input: PortalSessionInput): Promise<{ url: string }> {
  const { userId, returnUrl } = input;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const portalUrl = `${baseUrl}/billing/portal?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl || baseUrl)}`;
  return { url: portalUrl };
}
