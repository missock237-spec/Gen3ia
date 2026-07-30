// ============================================================
// SubPay Client — Paiements africains unifies
// Supporte: MTN MoMo, Orange Money, Wave, Free Money, etc.
// Documentation: https://docs.subpay.app
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('subpay');

const SUBPAY_API_URL = process.env.SUBPAY_API_URL || 'https://api.subpay.app/v1';
const SUBPAY_API_KEY = process.env.SUBPAY_API_KEY || '';
const SUBPAY_WEBHOOK_SECRET = process.env.SUBPAY_WEBHOOK_SECRET || '';
const SUBPAY_STORE_ID = process.env.SUBPAY_STORE_ID || '';

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
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = SUBPAY_API_URL;
    this.apiKey = SUBPAY_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Store-ID': SUBPAY_STORE_ID,
    };
  }

  isConfigured(): boolean {
    return !!(this.apiKey && SUBPAY_STORE_ID);
  }

  async initiatePayment(params: {
    amount: number;
    currency: SubPayCurrency;
    provider: SubPayProvider;
    phone: string;
    reference: string;
    description?: string;
    metadata?: Record<string, string>;
    callbackUrl?: string;
    redirectUrl?: string;
  }): Promise<SubPayTransaction> {
    if (!this.isConfigured()) {
      throw new Error('SubPay non configure. Definissez SUBPAY_API_KEY et SUBPAY_STORE_ID.');
    }

    log.info('subpay_initiate', {
      amount: params.amount,
      provider: params.provider,
      reference: params.reference,
    });

    const response = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        provider: params.provider,
        phone: params.phone,
        reference: params.reference,
        description: params.description || 'Achat de credits Genova',
        metadata: params.metadata || {},
        callback_url: params.callbackUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook`,
        redirect_url: params.redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'unknown');
      throw new Error(`SubPay error (${response.status}): ${err.slice(0, 200)}`);
    }

    const data = await response.json();

    log.info('subpay_payment_initiated', {
      transactionId: data.id,
      reference: params.reference,
      status: data.status,
    });

    return data as SubPayTransaction;
  }

  async checkStatus(transactionId: string): Promise<SubPayTransaction> {
    const response = await fetch(`${this.baseUrl}/payments/${transactionId}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`SubPay status check failed (${response.status})`);
    }

    return response.json() as Promise<SubPayTransaction>;
  }

  /**
   * Verifie la signature HMAC SHA-256 avec constant-time compare
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!SUBPAY_WEBHOOK_SECRET || !signature || !body) return false;
    try {
      const expected = createHmac('sha256', SUBPAY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf-8');
      const signatureBuf = Buffer.from(signature, 'utf-8');
      if (expectedBuf.length !== signatureBuf.length) return false;
      return timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }

  async getAvailableProviders(): Promise<SubPayProvider[]> {
    try {
      const response = await fetch(`${this.baseUrl}/providers`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return ['mtn', 'orange', 'wave'];
      const data = await response.json();
      return data.providers || ['mtn', 'orange', 'wave'];
    } catch {
      return ['mtn', 'orange', 'wave'];
    }
  }
}

export const subpay = new SubPayClient();