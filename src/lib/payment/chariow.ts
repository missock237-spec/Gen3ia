// ============================================================
// CHARIOW CLIENT — Paiement numérique (Mobile Money Afrique + Carte)
// Installateur officiel de Gen3ia/Genova
// Documentation: https://chariow.dev
// Base URL: https://api.chariow.com/v1
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('chariow');

const CHARIOW_API_URL = process.env.CHARIOW_API_URL || 'https://api.chariow.com/v1';
const CHARIOW_API_KEY = process.env.CHARIOW_API_KEY || '';
const CHARIOW_WEBHOOK_SECRET = process.env.CHARIOW_WEBHOOK_SECRET || '';

export type ChariowCurrency = 'XAF' | 'XOF' | 'EUR' | 'USD';
export type ChariowSaleStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface ChariowCheckoutParams {
  /** Identifiant du produit Chariow (plan ou pack de crédits) */
  productId: string;
  quantity?: number;
  customerEmail?: string;
  customerName?: string;
  /** Métadonnées libres (incluent userId, type, plan/pack) */
  metadata?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
}

export interface ChariowCheckoutResult {
  /** Étape renvoyée par l'API: payment | completed | already_purchased */
  step: 'payment' | 'completed' | 'already_purchased';
  /** URL de paiement hébergé Chariow (si step === 'payment') */
  checkoutUrl?: string;
  /** Identifiant de la vente créée */
  saleId?: string;
}

export interface ChariowWebhookPayload {
  event: string; // 'sale.completed' | 'payment.received' | 'refund.processed'
  data: {
    id: string;          // sale id
    reference?: string;
    status: string;
    amount?: number;
    currency?: string;
    product?: { id: string; name?: string };
    customer?: { email?: string; name?: string };
    metadata?: Record<string, string>;
    paidAt?: string;
  };
  timestamp?: string;
}

class ChariowClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = CHARIOW_API_URL;
    this.apiKey = CHARIOW_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Initie une session de checkout Chariow.
   * POST /v1/checkout
   */
  async initiateCheckout(params: ChariowCheckoutParams): Promise<ChariowCheckoutResult> {
    if (!this.isConfigured()) {
      throw new Error('Chariow non configuré. Définissez CHARIOW_API_KEY.');
    }

    log.info('chariow_checkout_init', {
      productId: params.productId,
      quantity: params.quantity ?? 1,
      metadata: params.metadata,
    });

    const response = await fetch(`${this.baseUrl}/checkout`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        product_id: params.productId,
        quantity: params.quantity ?? 1,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
        metadata: params.metadata ?? {},
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'unknown');
      throw new Error(`Chariow error (${response.status}): ${err.slice(0, 200)}`);
    }

    const data = await response.json();

    log.info('chariow_checkout_initiated', {
      step: data.step,
      saleId: data.sale_id ?? data.id,
      checkoutUrl: data.checkout_url ?? data.redirect_url,
    });

    return {
      step: (data.step as ChariowCheckoutResult['step']) || (data.checkout_url ? 'payment' : 'completed'),
      checkoutUrl: data.checkout_url ?? data.redirect_url ?? data.url,
      saleId: data.sale_id ?? data.id,
    };
  }

  /**
   * Vérifie le statut d'une vente Chariow.
   * GET /v1/sales/:id
   */
  async getSaleStatus(saleId: string): Promise<{ status: ChariowSaleStatus; sale?: any }> {
    const response = await fetch(`${this.baseUrl}/sales/${saleId}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Chariow sale lookup failed (${response.status})`);
    }

    const data = await response.json();
    const status = (data.status ?? data.sale?.status ?? 'pending') as ChariowSaleStatus;
    return { status, sale: data.sale ?? data };
  }

  /**
   * Vérifie la signature HMAC SHA-256 d'un webhook Chariow (constant-time).
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!CHARIOW_WEBHOOK_SECRET || !signature || !body) return false;
    try {
      const expected = createHmac('sha256', CHARIOW_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
      const expectedBuf = Buffer.from(expected, 'utf-8');
      const signatureBuf = Buffer.from(sig, 'utf-8');
      if (expectedBuf.length !== signatureBuf.length) return false;
      return timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }

  /**
   * Gère le webhook Chariow : crédite l'utilisateur / active l'abonnement.
   */
  async handleWebhook(payload: ChariowWebhookPayload): Promise<void> {
    const event = payload.event || '';
    const sale = payload.data ?? (payload as any);
    const status = sale.status || '';

    log.info('chariow_webhook_received', { event, saleId: sale.id, status });

    const isSuccess =
      event.includes('sale.completed') ||
      event.includes('payment.received') ||
      status === 'completed';

    if (!isSuccess) {
      log.info('chariow_webhook_non_completed', { event, status });
      return;
    }

    const metadata = sale.metadata ?? {};
    const userId = metadata.userId || sale.metadata?.userId;
    const type = metadata.type || sale.metadata?.type || 'plan';
    const planId = metadata.planId || sale.metadata?.planId;
    const credits = Number(metadata.credits || sale.metadata?.credits || 0);

    if (!userId) {
      log.warn('chariow_webhook_missing_user', { saleId: sale.id });
      return;
    }

    await db.$transaction(async (tx) => {
      // Créditer les crédits achetés
      if (credits > 0) {
        await tx.creditTransaction.create({
          data: {
            userId,
            amount: credits,
            balance: credits,
            type: 'purchase',
            resourceType: type === 'credits' ? 'credit_purchase' : 'subscription',
            description: `Achat via Chariow: ${credits} crédits (sale ${sale.id})`,
            metadata: JSON.stringify({ provider: 'chariow', saleId: sale.id, type, planId }),
          },
        });
      }

      // Activer / mettre à jour l'abonnement si c'est un plan
      if (planId) {
        await tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: planId,
            status: 'active',
            provider: 'chariow',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          update: {
            plan: planId,
            status: 'active',
            provider: 'chariow',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
        await tx.user.update({ where: { id: userId }, data: { plan: planId } });
      }
    });

    log.info('chariow_payment_credited', { userId: userId.slice(0, 8), credits, planId });
  }
}

export const chariow = new ChariowClient();
export default chariow;
