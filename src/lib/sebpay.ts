/**
 * SebPay Africa - Service de paiement Mobile Money
 * API REST pour intégration des paiements Mobile Money dans 15 pays africains
 * 
 * Endpoint de test: https://sandbox.sebpay.africa/api/v1
 * Documentation: https://sebpay.africa/docs
 */

interface SebPayConfig {
  apiKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  webhookSecret: string;
}

interface SebPayPaymentRequest {
  amount: number;
  currency: string;
  phone: string;
  operator: 'MTN' | 'ORANGE' | 'MOOV' | 'EXPRESSU' | 'AIRTEL' | 'FREEMONEY' | 'WAVE';
  description: string;
  reference: string;
  callbackUrl?: string;
  redirectUrl?: string;
}

interface SebPayPaymentResponse {
  status: 'pending' | 'success' | 'failed';
  transactionId: string;
  reference: string;
  paymentUrl?: string;
  message: string;
}

interface SebPayTransaction {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  phone: string;
  operator: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  description: string;
  createdAt: string;
  updatedAt: string;
  fees?: number;
}

let config: SebPayConfig = {
  apiKey: process.env.SEBPAY_API_KEY || '',
  secretKey: process.env.SEBPAY_SECRET_KEY || '',
  environment: (process.env.SEBPAY_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  webhookSecret: process.env.SEBPAY_WEBHOOK_SECRET || '',
};

export function configureSebPay(newConfig: Partial<SebPayConfig>) {
  config = { ...config, ...newConfig };
}

function getBaseUrl(): string {
  return config.environment === 'production'
    ? 'https://api.sebpay.africa/v1'
    : 'https://sandbox-api.sebpay.africa/v1';
}

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': config.apiKey,
    'X-Secret-Key': config.secretKey,
  };
}

/**
 * Initier un paiement Mobile Money via SebPay
 */
export async function initiatePayment(
  payment: SebPayPaymentRequest
): Promise<SebPayPaymentResponse> {
  const response = await fetch(`${getBaseUrl()}/payments`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      amount: payment.amount,
      currency: payment.currency || 'XAF',
      phone: payment.phone,
      operator: payment.operator,
      description: payment.description,
      reference: payment.reference,
      callback_url: payment.callbackUrl,
      redirect_url: payment.redirectUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Payment initiation failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Vérifier le statut d'une transaction
 */
export async function checkTransactionStatus(
  transactionId: string
): Promise<SebPayTransaction> {
  const response = await fetch(`${getBaseUrl()}/payments/${transactionId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transaction: ${response.status}`);
  }

  return response.json();
}

/**
 * Vérifier la signature d'un webhook SebPay
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  try {
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(payload)
      .digest('hex');
    return expected === signature;
  } catch {
    return false;
  }
}

/**
 * Plans Genova avec prix en FCFA (XAF)
 */
export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'XAF',
    interval: 'month',
    credits: 100,
    features: [
      { name: '2 AI Agents', included: true },
      { name: '100 credits/month', included: true },
      { name: 'Basic agent tools', included: true },
      { name: '3 scheduled tasks', included: true },
      { name: 'Advanced guardrails', included: false },
      { name: 'Web monitors', included: false },
      { name: 'Priority support', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 5000,
    currency: 'XAF',
    interval: 'month',
    credits: 1000,
    featured: true,
    features: [
      { name: '5 AI Agents', included: true },
      { name: '1,000 credits/month', included: true },
      { name: 'All agent tools', included: true },
      { name: '10 scheduled tasks', included: true },
      { name: '5 web monitors', included: true },
      { name: 'Advanced guardrails', included: true },
      { name: 'Priority support', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 15000,
    currency: 'XAF',
    interval: 'month',
    credits: 5000,
    highlighted: true,
    badge: 'Populaire',
    features: [
      { name: '20 AI Agents', included: true },
      { name: '5,000 credits/month', included: true },
      { name: 'All tools + advanced', included: true },
      { name: '50 scheduled tasks', included: true },
      { name: '25 web monitors', included: true },
      { name: 'Auto-reports', included: true },
      { name: 'Priority support', included: true },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 50000,
    currency: 'XAF',
    interval: 'month',
    credits: -1,
    badge: 'Meilleur Rapport Qualité/Prix',
    features: [
      { name: 'Unlimited Agents', included: true },
      { name: 'Unlimited credits', included: true },
      { name: 'All tools & features', included: true },
      { name: 'Unlimited tasks', included: true },
      { name: 'SSO & SAML', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'SLA guarantee', included: true },
    ],
  },
];

/**
 * Packs de crédits SebPay
 */
export const CREDIT_PACKAGES = [
  { id: 'credits_500', name: 'Petit Pack', credits: 500, price: 2500, currency: 'XAF' },
  { id: 'credits_2000', name: 'Pack Standard', credits: 2000, price: 9000, currency: 'XAF' },
  { id: 'credits_5000', name: 'Gros Pack', credits: 5000, price: 20000, currency: 'XAF' },
  { id: 'credits_10000', name: 'Pack Pro', credits: 10000, price: 35000, currency: 'XAF' },
];
