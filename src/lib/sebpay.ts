// ============================================================
// SEBPAY SERVICE — Paiements Mobile Money Afrique
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from "./db";
import { logger } from "./logger";
import { parseSubscriptionReference } from "./safe-regex";

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  priceUSD: number;
  credits: number;
  maxAgents: number;
  maxWorkflows: number;
  maxTokensPerMonth: number;
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: "free", name: "Free", price: 0, priceUSD: 0, credits: 10, maxAgents: 1, maxWorkflows: 1, maxTokensPerMonth: 100_000, features: ["1 agent IA", "1 workflow", "100K tokens/mois", "Support communautaire"] },
  { id: "starter", name: "Starter", price: 5000, priceUSD: 9.99, credits: 1000, maxAgents: 10, maxWorkflows: 10, maxTokensPerMonth: 1_000_000, features: ["10 agents IA", "10 workflows", "1M tokens/mois", "Memoire persistante", "Outils web"] },
  { id: "pro", name: "Pro", price: 15000, priceUSD: 29.99, credits: 5000, maxAgents: 50, maxWorkflows: -1, maxTokensPerMonth: 5_000_000, features: ["50 agents IA", "Workflows illimites", "5M tokens/mois", "File d'attente prioritaire", "Webhooks sortants"], popular: true },
  { id: "enterprise", name: "Enterprise", price: 50000, priceUSD: 99.99, credits: 25000, maxAgents: -1, maxWorkflows: -1, maxTokensPerMonth: 25_000_000, features: ["Agents illimites", "Workflows illimites", "25M tokens/mois", "Support dedie 24/7", "SLA garanti", "Deploiement prive"] },
];

interface SebPayConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  webhookSecret: string;
}

function getSebPayConfig(): SebPayConfig {
  return {
    apiKey: process.env.SEBPAY_API_KEY ?? "",
    apiSecret: process.env.SEBPAY_API_SECRET ?? "",
    baseUrl: process.env.SEBPAY_BASE_URL ?? "https://api.sebpay.africa/v1",
    webhookSecret: process.env.SEBPAY_WEBHOOK_SECRET ?? "",
  };
}

export interface SebPayPaymentRequest {
  amount: number;
  currency: string;
  phone: string;
  operator: string;
  description: string;
  reference: string;
  callbackUrl: string;
}

export interface SebPayPaymentResponse {
  success: boolean;
  transactionId?: string;
  paymentUrl?: string;
  status?: string;
  message?: string;
}

export class SebPayService {
  private config: SebPayConfig;

  constructor() {
    this.config = getSebPayConfig();
  }

  async initiatePayment(request: SebPayPaymentRequest): Promise<SebPayPaymentResponse> {
    logger.info("sebpay_payment_initiated", { amount: request.amount, currency: request.currency, operator: request.operator, reference: request.reference });
    try {
      const response = await fetch(`${this.config.baseUrl}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": this.config.apiKey, "X-Api-Secret": this.config.apiSecret },
        body: JSON.stringify({
          amount: request.amount, currency: request.currency, phone: request.phone,
          operator: request.operator, description: request.description, reference: request.reference,
          callback_url: request.callbackUrl, metadata: { source: "genova", version: "1.0" },
        }),
      });
      if (!response.ok) { const error = await response.text(); logger.error("sebpay_payment_failed", { reference: request.reference, status: response.status, error }); return { success: false, message: `Erreur SebPay: ${response.status}` }; }
      const data = await response.json();
      logger.info("sebpay_payment_success", { reference: request.reference, transactionId: data.transaction_id });
      return { success: true, transactionId: data.transaction_id, paymentUrl: data.payment_url, status: data.status };
    } catch (error) {
      logger.error("sebpay_payment_error", { reference: request.reference, error: error instanceof Error ? error.message : String(error) });
      return { success: false, message: "Erreur de connexion au service SebPay" };
    }
  }

  async checkPaymentStatus(transactionId: string): Promise<SebPayPaymentResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}/payments/${transactionId}`, {
        headers: { "X-Api-Key": this.config.apiKey, "X-Api-Secret": this.config.apiSecret },
      });
      if (!response.ok) return { success: false, message: "Transaction introuvable" };
      const data = await response.json();
      return { success: data.status === "completed", status: data.status, transactionId };
    } catch (error) { return { success: false, message: String(error) }; }
  }

  /**
   * Verifie la signature HMAC SHA-256 d'un webhook SebPay avec constant-time compare
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = this.config.webhookSecret;
    if (!secret || !signature || !payload) return false;
    try {
      const expected = createHmac('sha256', secret).update(payload).digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf-8');
      const signatureBuf = Buffer.from(signature, 'utf-8');
      if (expectedBuf.length !== signatureBuf.length) return false;
      return timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: {
    event: string;
    transaction_id: string;
    reference: string;
    status: string;
    amount: number;
    currency: string;
    operator: string;
    phone: string;
  }): Promise<void> {
    logger.info("sebpay_webhook_received", { event: payload.event, transactionId: payload.transaction_id, reference: payload.reference });
    if (payload.event !== "payment.completed" || payload.status !== "completed") return;

    const parsed = parseSubscriptionReference(payload.reference);
    if (!parsed.planId || !parsed.userId) {
      logger.warn("sebpay_webhook_invalid_reference", { reference: payload.reference });
      return;
    }

    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === parsed.planId);
    if (!plan) { logger.warn("sebpay_webhook_unknown_plan", { planId: parsed.planId }); return; }

    await db.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { userId: parsed.userId! },
        update: { plan: parsed.planId, status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        create: { userId: parsed.userId!, plan: parsed.planId, status: "active", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
      await tx.creditTransaction.create({
        data: { userId: parsed.userId!, amount: plan.credits, balance: plan.credits, type: "purchase", resourceType: "subscription", description: `Abonnement ${plan.name} - ${payload.amount} ${payload.currency}` },
      });
      await tx.user.update({ where: { id: parsed.userId! }, data: { plan: parsed.planId } });
    });

    logger.info("sebpay_subscription_activated", { userId: parsed.userId, planId: parsed.planId, credits: plan.credits });
  }
}

export const sebpay = new SebPayService();

/** Alias: billing routes import PLANS from @/lib/sebpay */
export const PLANS = SUBSCRIPTION_PLANS;

/** Re-export initiatePayment as a standalone function for convenience */
export const initiatePayment = sebpay.initiatePayment.bind(sebpay);
