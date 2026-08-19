// ============================================================
// SUBPAY -> CHARIOW ADAPTER
// L'ancien provider SubPay est supprimé. Tous les paiements passent
// désormais par Chariow (https://chariow.dev).
// Ce module conserve l'API historique pour ne pas casser les imports,
// mais délègue réellement à Chariow.
// ============================================================

import { chariow } from "@/lib/payment/chariow";

export type SubPayCurrency = 'XAF' | 'XOF' | 'CDF' | 'EUR' | 'USD';
export type SubPayProvider = 'mtn' | 'orange' | 'wave' | 'free' | 'moov' | 'airtel' | 'mpesa';
export type SubPayStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface SubPayTransaction {
  id: string;
  reference: string;
  amount: number;
  currency: SubPayCurrency;
  provider: SubPayProvider;
  phone?: string;
  status: SubPayStatus;
  redirectUrl?: string;
  createdAt: string;
  paidAt?: string;
}

export interface SubPayWebhookPayload {
  event: 'payment.completed' | 'payment.failed' | 'payment.cancelled';
  data: {
    id: string;
    reference: string;
    amount: number;
    currency: string;
    provider: string;
    phone: string;
    status: string;
    metadata: Record<string, string>;
    paidAt: string;
  };
  timestamp: string;
  signature: string;
}

class SubPayClient {
  isConfigured(): boolean {
    return chariow.isConfigured();
  }

  async initiatePayment(params: {
    amount: number;
    currency: SubPayCurrency;
    provider?: SubPayProvider;
    phone?: string;
    reference: string;
    description?: string;
    metadata?: Record<string, string>;
    callbackUrl?: string;
    redirectUrl?: string;
  }): Promise<SubPayTransaction> {
    if (!this.isConfigured()) {
      throw new Error('Chariow non configuré. Définissez CHARIOW_API_KEY.');
    }

    const productId = process.env.CHARIOW_PRODUCT_DEFAULT || '';
    if (!productId) {
      throw new Error('Produit Chariow non configuré (CHARIOW_PRODUCT_DEFAULT).');
    }

    const checkout = await chariow.initiateCheckout({
      productId,
      metadata: {
        ...(params.metadata || {}),
        reference: params.reference,
        amount: String(params.amount),
        currency: params.currency,
      },
      successUrl: params.redirectUrl || params.callbackUrl,
      cancelUrl: params.callbackUrl,
    });

    return {
      id: checkout.saleId || params.reference,
      reference: params.reference,
      amount: params.amount,
      currency: params.currency,
      provider: (params.provider || 'orange') as SubPayProvider,
      phone: params.phone,
      status: (checkout.step === 'payment' ? 'pending' : 'processing') as SubPayStatus,
      redirectUrl: checkout.checkoutUrl,
      createdAt: new Date().toISOString(),
    };
  }

  async checkStatus(transactionId: string): Promise<SubPayTransaction> {
    const { status, sale } = await chariow.getSaleStatus(transactionId);
    return {
      id: transactionId,
      reference: sale?.reference || transactionId,
      amount: sale?.amount || 0,
      currency: (sale?.currency || 'XAF') as SubPayCurrency,
      provider: 'orange',
      status: status as SubPayStatus,
      createdAt: new Date().toISOString(),
    };
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    return chariow.verifyWebhookSignature(body, signature);
  }

  async getAvailableProviders(): Promise<SubPayProvider[]> {
    return ['mtn', 'orange', 'wave'];
  }
}

export const subpay = new SubPayClient();
