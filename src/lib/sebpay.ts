// ============================================================
// SEBPAY -> CHARIOW ADAPTER
// L'ancien provider SebPay est supprimé. Tous les paiements passent
// désormais par Chariow (https://chariow.dev).
// Ce module conserve l'API historique (sebpay, PLANS, SUBSCRIPTION_PLANS,
// initiatePayment, SebPayService) pour ne pas casser les imports existants,
// mais délègue réellement à Chariow.
// ============================================================

import { chariow } from "@/lib/payment/chariow";

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

export interface SebPayPaymentRequest {
  amount: number;
  currency: string;
  phone?: string;
  operator?: string;
  description: string;
  reference: string;
  callbackUrl?: string;
  redirectUrl?: string;
  customerEmail?: string;
  customerName?: string;
}

export interface SebPayPaymentResponse {
  success: boolean;
  transactionId?: string;
  paymentUrl?: string;
  status?: string;
  message?: string;
}

export class SebPayService {
  /**
   * Initie un paiement. Adaptateur -> Chariow.
   * Le productId est déduit du reference (plan) ou via la variable d'env générique.
   */
  async initiatePayment(request: SebPayPaymentRequest): Promise<SebPayPaymentResponse> {
    try {
      const productId =
        process.env[`CHARIOW_PRODUCT_PLAN_${request.description?.split(' ')[1]?.toUpperCase() || 'PRO'}`] ||
        process.env.CHARIOW_PRODUCT_DEFAULT ||
        '';

      if (!productId) {
        return { success: false, message: "Produit Chariow non configuré (CHARIOW_PRODUCT_DEFAULT)" };
      }

      const checkout = await chariow.initiateCheckout({
        productId,
        customerEmail: request.customerEmail,
        customerName: request.customerName,
        metadata: {
          userId: request.reference.split('_')[1] || '',
          type: 'plan',
          reference: request.reference,
          amount: String(request.amount),
          currency: request.currency,
        },
        successUrl: request.redirectUrl || request.callbackUrl,
        cancelUrl: request.callbackUrl,
      });

      return {
        success: true,
        transactionId: checkout.saleId || request.reference,
        paymentUrl: checkout.checkoutUrl,
        status: checkout.step === 'payment' ? 'pending' : checkout.step,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async checkPaymentStatus(transactionId: string): Promise<SebPayPaymentResponse> {
    try {
      const { status, _sale } = await chariow.getSaleStatus(transactionId);
      return { success: status === 'completed', status, transactionId };
    } catch (error) {
      return { success: false, message: String(error) };
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return chariow.verifyWebhookSignature(payload, signature);
  }

  async handleWebhook(payload: any): Promise<void> {
    await chariow.handleWebhook(payload);
  }
}

export const sebpay = new SebPayService();

/** Alias: billing routes import PLANS from @/lib/sebpay */
export const PLANS = SUBSCRIPTION_PLANS;

/** Re-export initiatePayment as a standalone function for convenience */
export const initiatePayment = sebpay.initiatePayment.bind(sebpay);
