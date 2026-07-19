/**
 * SebPay Africa - Service de paiement Mobile Money
 * Site: https://sebpay.africa
 * 
 * Configuration des clés :
 *   SEBPAY_PUBLIC_KEY  = Identifiant public du marchand
 *   SEBPAY_SECRET_KEY  = Clé secrète pour signer les requêtes
 *   SEBPAY_ENVIRONMENT = sandbox | production
 */

interface SebPayConfig {
  publicKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  webhookSecret: string;
}

interface SebPayPaymentRequest {
  amount: number;
  currency: string;
  description: string;
  reference: string;
  callbackUrl?: string;
  redirectUrl?: string;
  customerEmail?: string;
  customerName?: string;
}

interface SebPayPaymentResponse {
  status: 'pending' | 'success' | 'failed';
  transactionId: string;
  reference: string;
  paymentUrl?: string;
  message: string;
}

const config: SebPayConfig = {
  publicKey: process.env.SEBPAY_PUBLIC_KEY || '',
  secretKey: process.env.SEBPAY_SECRET_KEY || '',
  environment: (process.env.SEBPAY_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  webhookSecret: process.env.SEBPAY_WEBHOOK_SECRET || '',
};

function getBaseUrl(): string {
  return config.environment === 'production'
    ? 'https://api.sebpay.africa/v1'
    : 'https://sandbox-api.sebpay.africa/v1';
}

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Public-Key': config.publicKey,
    'X-Secret-Key': config.secretKey,
  };
}

/**
 * Initier un paiement via SebPay (Mobile Money automatique)
 * 
 * @example
 * const payment = await initiatePayment({
 *   amount: 5000,
 *   currency: 'XAF',
 *   description: 'Abonnement Starter - Genova AI',
 *   reference: 'GENOVA-001',
 * });
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
      description: payment.description,
      reference: payment.reference,
      callback_url: payment.callbackUrl,
      redirect_url: payment.redirectUrl,
      customer_email: payment.customerEmail,
      customer_name: payment.customerName,
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
): Promise<{ id: string; reference: string; amount: number; currency: string; status: string; description: string; createdAt: string }> {
  const response = await fetch(`${getBaseUrl()}/payments/${transactionId}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to fetch transaction: ${response.status}`);
  return response.json();
}

/**
 * Plans Genova avec prix en FCFA (XAF)
 */
export const PLANS = [
  {
    id: 'free', name: 'Free', price: 0, currency: 'XAF', interval: 'month', credits: 100,
    features: [
      { name: '2 AI Agents', included: true }, { name: '100 credits/month', included: true },
      { name: 'Basic agent tools', included: true }, { name: '3 scheduled tasks', included: true },
      { name: 'Advanced guardrails', included: false }, { name: 'Priority support', included: false },
    ],
  },
  {
    id: 'starter', name: 'Starter', price: 5000, currency: 'XAF', interval: 'month', credits: 1000,
    featured: true,
    features: [
      { name: '5 AI Agents', included: true }, { name: '1,000 credits/month', included: true },
      { name: 'All agent tools', included: true }, { name: '10 scheduled tasks', included: true },
      { name: '5 web monitors', included: true }, { name: 'Advanced guardrails', included: true },
      { name: 'Priority support', included: false },
    ],
  },
  {
    id: 'pro', name: 'Pro', price: 15000, currency: 'XAF', interval: 'month', credits: 5000,
    highlighted: true, badge: 'Populaire',
    features: [
      { name: '20 AI Agents', included: true }, { name: '5,000 credits/month', included: true },
      { name: 'All tools + advanced', included: true }, { name: '50 scheduled tasks', included: true },
      { name: '25 web monitors', included: true }, { name: 'Auto-reports', included: true },
      { name: 'Priority support', included: true },
    ],
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 50000, currency: 'XAF', interval: 'month', credits: -1,
    badge: 'Meilleur Rapport Qualité/Prix',
    features: [
      { name: 'Unlimited Agents', included: true }, { name: 'Unlimited credits', included: true },
      { name: 'All tools & features', included: true }, { name: 'Unlimited tasks', included: true },
      { name: 'SSO & SAML', included: true }, { name: 'Custom integrations', included: true },
      { name: 'SLA guarantee', included: true },
    ],
  },
];

export const CREDIT_PACKAGES = [
  { id: 'credits_500', name: 'Petit Pack', credits: 500, price: 2500, currency: 'XAF' },
  { id: 'credits_2000', name: 'Pack Standard', credits: 2000, price: 9000, currency: 'XAF' },
  { id: 'credits_5000', name: 'Gros Pack', credits: 5000, price: 20000, currency: 'XAF' },
  { id: 'credits_10000', name: 'Pack Pro', credits: 10000, price: 35000, currency: 'XAF' },
];
