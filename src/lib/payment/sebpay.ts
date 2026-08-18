// ============================================================
// SEBPAY MARKETPLACE CLIENT — Paiement Mobile Money (Afrique)
// ------------------------------------------------------------
//  Spécifique à la marketplace Gen3ia.
//  - Initie un paiement acheteur (buyer) via Sebpay Mobile Money
//  - Vérifie le statut d'une transaction
//  - Verrouille les webhooks via signature HMAC SHA-256
//  - Sur confirmation d'achat, déclenche l'AUTO-PAYOUT vendeur
//    (80% du montant net automatiquement transféré au compte
//    Mobile Money du créateur, 20% retenus comme commission plateforme).
//
//  Documentation API: https://sebpay.com/api/v1
//  Authentication: Bearer token (SEBPAY_API_KEY)
//  Webhook signature header: x-sebpay-signature
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('sebpay-marketplace');

const SEBPAY_API_URL = process.env.SEBPAY_API_URL || 'https://api.sebpay.com/v1';
const SEBPAY_API_KEY = process.env.SEBPAY_API_KEY || '';
const SEBPAY_WEBHOOK_SECRET = process.env.SEBPAY_WEBHOOK_SECRET || '';

// ─── Commission split ───────────────────────────────────────────────────
// 80% → vendeur (creator)
// 20% → plateforme (Gen3ia)
export const MARKETPLACE_COMMISSION_RATE = 0.20; // 20%
export const MARKETPLACE_SELLER_RATE = 0.80;     // 80%

export type SebpayCurrency = 'XAF' | 'XOF' | 'CDF' | 'EUR' | 'USD';
export type SebpayProvider = 'mtn' | 'orange' | 'wave' | 'moov' | 'airtel' | 'mpesa' | 'visa' | 'mastercard';
export type SebpayTransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export interface SebpayInitiatePaymentParams {
  /** Montant dans la devise du listing (généralement XAF) */
  amount: number;
  currency: SebpayCurrency;
  /** Numéro Mobile Money du buyer (si paiement MoMo) */
  phone?: string;
  /** Provider MoMo préféré */
  provider?: SebpayProvider;
  /** Référence unique côté Gen3ia (ex: mkt_<purchaseId>) */
  reference: string;
  /** Description lisible (pour le reçu) */
  description: string;
  /** URLs de redirection après paiement */
  callbackUrl?: string;
  redirectUrl?: string;
  /** Métadonnées libres (listingId, buyerId, sellerId, sellerRevenue...) */
  metadata?: Record<string, string>;
  customerEmail?: string;
  customerName?: string;
}

export interface SebpayInitiatePaymentResult {
  success: boolean;
  /** ID de transaction côté Sebpay */
  transactionId?: string;
  /** URL de paiement hébergé (si applicable) */
  paymentUrl?: string;
  status?: SebpayTransactionStatus;
  message?: string;
}

export interface SebpayWebhookPayload {
  event: 'payment.completed' | 'payment.failed' | 'payment.cancelled' | 'payout.completed' | 'payout.failed';
  data: {
    id: string;
    reference: string;
    amount?: number;
    currency?: string;
    provider?: string;
    phone?: string;
    status: string;
    metadata?: Record<string, string>;
    paidAt?: string;
    /** Pour les payouts: compte destinataire */
    payoutAccount?: string;
    payoutAmount?: number;
  };
  timestamp?: string;
}

// ============================================================
//  SEBPAY CLIENT (HTTP)
// ============================================================

class SebpayClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = SEBPAY_API_URL;
    this.apiKey = SEBPAY_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Gen3ia-Source': 'marketplace',
    };
  }

  /**
   * Initie un paiement buyer.
   * POST /v1/payments
   */
  async initiatePayment(params: SebpayInitiatePaymentParams): Promise<SebpayInitiatePaymentResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Sebpay non configuré. Définissez SEBPAY_API_KEY.',
      };
    }

    log.info('sebpay_payment_init', {
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
      provider: params.provider ?? null,
    });

    try {
      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          reference: params.reference,
          amount: params.amount,
          currency: params.currency,
          phone: params.phone,
          provider: params.provider,
          description: params.description,
          metadata: params.metadata ?? {},
          customer_email: params.customerEmail,
          customer_name: params.customerName,
          callback_url: params.callbackUrl,
          redirect_url: params.redirectUrl,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => 'unknown');
        throw new Error(`Sebpay HTTP ${response.status}: ${err.slice(0, 200)}`);
      }

      const data = await response.json();

      return {
        success: true,
        transactionId: data.id || data.transaction_id || data.reference,
        paymentUrl: data.payment_url || data.redirect_url || data.checkout_url,
        status: (data.status || 'pending') as SebpayTransactionStatus,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('sebpay_payment_init_failed', { reference: params.reference, error: msg });
      return { success: false, message: msg };
    }
  }

  /**
   * Vérifie le statut d'une transaction Sebpay.
   * GET /v1/payments/:id
   */
  async getPaymentStatus(transactionId: string): Promise<{ status: SebpayTransactionStatus; raw: unknown }> {
    if (!this.isConfigured()) {
      throw new Error('Sebpay non configuré.');
    }
    const response = await fetch(`${this.baseUrl}/payments/${transactionId}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Sebpay lookup failed (${response.status})`);
    }
    const data = await response.json();
    return { status: (data.status || 'pending') as SebpayTransactionStatus, raw: data };
  }

  /**
   * Initie un PAYOUT créateur (transfert automatique 80% au vendeur).
   * POST /v1/payouts
   *
   * Le compte du créateur doit être pré-enregistré côté Sebpay
   * ( KYC + numéro Mobile Money ), référencé par `payoutAccountId`.
   */
  async initiatePayout(params: {
    amount: number;
    currency: SebpayCurrency;
    phone: string;
    provider?: SebpayProvider;
    reference: string;
    description: string;
    metadata?: Record<string, string>;
    callbackUrl?: string;
  }): Promise<{ success: boolean; transactionId?: string; status?: string; message?: string }> {
    if (!this.isConfigured()) {
      return { success: false, message: 'Sebpay non configuré.' };
    }

    log.info('sebpay_payout_init', {
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
      phone: params.phone.slice(-4).padStart(params.phone.length, '*'),
    });

    try {
      const response = await fetch(`${this.baseUrl}/payouts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          reference: params.reference,
          amount: params.amount,
          currency: params.currency,
          phone: params.phone,
          provider: params.provider || 'orange',
          description: params.description,
          metadata: params.metadata ?? {},
          callback_url: params.callbackUrl,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => 'unknown');
        throw new Error(`Sebpay payout HTTP ${response.status}: ${err.slice(0, 200)}`);
      }
      const data = await response.json();
      return {
        success: true,
        transactionId: data.id || data.transaction_id || data.reference,
        status: data.status || 'pending',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('sebpay_payout_init_failed', { reference: params.reference, error: msg });
      return { success: false, message: msg };
    }
  }

  /**
   * Vérifie la signature HMAC SHA-256 d'un webhook Sebpay (constant-time).
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!SEBPAY_WEBHOOK_SECRET || !signature || !body) return false;
    try {
      const expected = createHmac('sha256', SEBPAY_WEBHOOK_SECRET)
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
   * Gère un webhook Sebpay marketplace.
   *
   *  Sur `payment.completed`:
   *    1. Marque l'achat marketplace comme "completed"
   *    2. Calcule la part vendeur (80%) et la commission plateforme (20%)
   *    3. Déclenche un PAYOUT automatique au créateur
   *    4. Incrémente le compteur d'installations du listing
   *    5. Met à jour les earnings du créateur
   */
  async handleWebhookMarketplace(payload: SebpayWebhookPayload): Promise<void> {
    const event = payload.event || '';
    const data = payload.data || {};
    const status = data.status || '';
    const metadata = data.metadata ?? {};

    log.info('sebpay_webhook_received', { event, reference: data.reference, status });

    const isPaymentSuccess =
      event === 'payment.completed' ||
      status === 'completed';

    if (!isPaymentSuccess) {
      log.info('sebpay_webhook_non_completed', { event, status });
      return;
    }

    const listingId = metadata.listingId;
    const buyerId = metadata.buyerId;
    const sellerId = metadata.sellerId;
    const purchaseId = metadata.purchaseId;
    const salePrice = Number(metadata.salePrice || data.amount || 0);
    const currency = (metadata.currency || data.currency || 'XAF') as SebpayCurrency;

    if (!listingId || !buyerId || !sellerId || !purchaseId) {
      log.warn('sebpay_webhook_missing_metadata', { metadata });
      return;
    }

    // 1. Marquer l'achat comme complété (si pas déjà fait)
    const existing = await db.marketplacePurchase.findUnique({
      where: { id: purchaseId },
    });
    if (!existing) {
      log.warn('sebpay_webhook_purchase_not_found', { purchaseId });
      return;
    }
    if (existing.status === 'completed') {
      log.info('sebpay_webhook_already_completed', { purchaseId });
      return;
    }

    const sellerRevenue = Math.round(salePrice * MARKETPLACE_SELLER_RATE * 100) / 100;
    const platformCommission = Math.round(salePrice * MARKETPLACE_COMMISSION_RATE * 100) / 100;

    await db.marketplacePurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'completed',
        sellerRevenue,
        platformCommission,
        transferStatus: 'pending_payout',
        metadata: JSON.stringify({
          ...parseSafeJson(existing.metadata as string, {}),
          sebpayTransactionId: data.id,
          sebpayPaidAt: data.paidAt || new Date().toISOString(),
          commissionRate: MARKETPLACE_COMMISSION_RATE,
          sellerRate: MARKETPLACE_SELLER_RATE,
          transferStatus: 'pending_payout',
        }),
      },
    });

    // 2. Incrémenter le compteur d'installations + revenue du listing
    await db.marketplaceListing.update({
      where: { id: listingId },
      data: {
        downloads: { increment: 1 },
        installCount: { increment: 1 },
        revenue: { increment: sellerRevenue },
      },
    });

    // 3. Incrémenter les earnings du créateur
    await db.user.update({
      where: { id: sellerId },
      data: { creatorEarnings: { increment: sellerRevenue } },
    });

    // 4. Déclencher AUTO-PAYOUT (80% → créateur)
    await this.triggerSellerPayout({
      sellerId,
      purchaseId,
      listingId,
      amount: sellerRevenue,
      currency,
    });

    log.info('sebpay_marketplace_purchase_completed', {
      purchaseId: purchaseId.slice(0, 8),
      listingId: listingId.slice(0, 8),
      salePrice,
      sellerRevenue,
      platformCommission,
    });
  }

  /**
   * Déclenche le transfert automatique 80% au créateur.
   *
   *  1. Récupère le profil payout du créateur (téléphone + provider)
   *  2. Si configuré → appel Sebpay /v1/payouts
   *  3. Sur succès → enregistre un CreatorPayout + marque le purchase
   *     transferStatus='transferred'. Sinon → transferStatus='payout_failed'.
   */
  async triggerSellerPayout(params: {
    sellerId: string;
    purchaseId: string;
    listingId: string;
    amount: number;
    currency: SebpayCurrency;
  }): Promise<void> {
    const { sellerId, purchaseId, listingId, amount, currency } = params;

    // Récupérer le profil de paiement du créateur.
    // Les champs creatorPayoutPhone / creatorPayoutProvider ne sont pas
    // dans le schéma Prisma canonique (Firestore est schemaless), on lit
    // donc le document utilisateur comme un enregistrement générique.
    const sellerDoc = (await db.user.findUnique({
      where: { id: sellerId },
    }).catch(() => null)) as Record<string, unknown> | null;

    const payoutPhone =
      (sellerDoc?.creatorPayoutPhone as string | undefined) ||
      (sellerDoc?.payoutPhone as string | undefined) ||
      '';

    if (!payoutPhone) {
      log.warn('sebpay_payout_no_phone_configured', { sellerId: sellerId.slice(0, 8) });
      // Marquer comme "payout_pending_phone" — sera traité manuellement
      // par le créateur depuis son dashboard CreatorPayouts.
      await db.marketplacePurchase.update({
        where: { id: purchaseId },
        data: { transferStatus: 'payout_pending_phone' },
      }).catch(() => undefined);
      return;
    }

    const payoutProvider =
      ((sellerDoc?.creatorPayoutProvider as string | undefined) || 'orange') as SebpayProvider;

    const payoutRef = `mkt_payout_${purchaseId}_${Date.now()}`;

    const result = await this.initiatePayout({
      amount,
      currency,
      phone: payoutPhone,
      provider: payoutProvider,
      reference: payoutRef,
      description: `Vente marketplace Gen3ia - ${listingId.slice(0, 8)}`,
      metadata: {
        sellerId,
        purchaseId,
        listingId,
        type: 'marketplace_payout',
        commissionRate: String(MARKETPLACE_COMMISSION_RATE),
        sellerRate: String(MARKETPLACE_SELLER_RATE),
      },
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace/webhook`,
    });

    // Enregistrer le payout côté Gen3ia (collection creatorPayout — Firestore schemaless).
    try {
      await db.creatorPayout.create({
        data: {
          userId: sellerId,
          amount,
          status: result.success ? 'processing' : 'failed',
          method: 'sebpay',
          phone: payoutPhone,
          operator: String(payoutProvider),
          transactionId: result.transactionId || payoutRef,
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      });
    } catch (e) {
      log.warn('sebpay_payout_record_failed', { error: e instanceof Error ? e.message : '' });
    }

    // Mettre à jour le statut de transfert du purchase
    await db.marketplacePurchase.update({
      where: { id: purchaseId },
      data: {
        transferStatus: result.success ? 'transferred' : 'payout_failed',
      },
    }).catch(() => undefined);

    log.info('sebpay_payout_triggered', {
      sellerId: sellerId.slice(0, 8),
      purchaseId: purchaseId.slice(0, 8),
      amount,
      success: result.success,
      transactionId: result.transactionId,
    });
  }
}

// ============================================================
//  Helpers
// ============================================================

function parseSafeJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ============================================================
//  Singleton
// ============================================================

export const sebpayMarketplace = new SebpayClient();
export default sebpayMarketplace;
