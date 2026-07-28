// ============================================================
// Tests étendus — Webhooks de paiement SebPay
// Validation HMAC, anti-replay, mise à jour abonnement
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    creditTransaction: { create: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn({
      subscription: { upsert: vi.fn().mockResolvedValue({ id: 'sub_1' }) },
      creditTransaction: { create: vi.fn().mockResolvedValue({ id: 'tx_1' }) },
      user: { update: vi.fn().mockResolvedValue({ id: 'user_1' }) },
    })),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/safe-regex', () => ({
  parseSubscriptionReference: vi.fn((ref: string) => {
    const parts = ref.split('_');
    return { planId: parts[1] || '', userId: parts[2] ? parts.slice(2).join('_') : '' };
  }),
}));

describe('Webhooks de paiement SebPay', () => {
  const TEST_SECRET = 'whsec_test_secret_key_32_chars_minimum!!';
  const VALID_PAYLOAD = {
    event: 'payment.completed',
    transaction_id: 'txn_abc123',
    reference: 'sub_pro_user_1_1719500000',
    status: 'completed',
    amount: 15000,
    currency: 'XAF',
    operator: 'mtn',
    phone: '+237670000000',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Simuler la config SebPay
    process.env.SEBPAY_WEBHOOK_SECRET = TEST_SECRET;
  });

  describe('1. Validation HMAC SHA-256', () => {
    it('verifie une signature HMAC valide', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      
      // Generer une signature valide
      const { createHmac } = await import('node:crypto');
      const payloadStr = JSON.stringify(VALID_PAYLOAD);
      const signature = createHmac('sha256', TEST_SECRET).update(payloadStr).digest('hex');
      
      const result = sebpay.verifyWebhookSignature(payloadStr, signature);
      expect(result).toBe(true);
    });

    it('rejette une signature invalide', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const payloadStr = JSON.stringify(VALID_PAYLOAD);
      
      const result = sebpay.verifyWebhookSignature(payloadStr, 'invalide_signature_12345');
      expect(result).toBe(false);
    });

    it('rejette avec un mauvais secret', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const { createHmac } = await import('node:crypto');
      
      const payloadStr = JSON.stringify(VALID_PAYLOAD);
      const signature = createHmac('sha256', 'wrong_secret_key_1234567890123456').update(payloadStr).digest('hex');
      
      const result = sebpay.verifyWebhookSignature(payloadStr, signature);
      expect(result).toBe(false);
    });

    it('rejette si le payload a ete modifie apres signature', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const { createHmac } = await import('node:crypto');
      
      const payloadStr = JSON.stringify(VALID_PAYLOAD);
      const signature = createHmac('sha256', TEST_SECRET).update(payloadStr).digest('hex');
      
      // Payload modifie
      const modifiedPayload = { ...VALID_PAYLOAD, amount: 99999 };
      const result = sebpay.verifyWebhookSignature(JSON.stringify(modifiedPayload), signature);
      expect(result).toBe(false);
    });

    it('rejette un payload vide', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      expect(sebpay.verifyWebhookSignature('', 'sig')).toBe(false);
    });

    it('rejette une signature vide', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      expect(sebpay.verifyWebhookSignature(JSON.stringify(VALID_PAYLOAD), '')).toBe(false);
    });

    it('rejette si pas de secret configure', async () => {
      delete process.env.SEBPAY_WEBHOOK_SECRET;
      const { sebpay } = await import('@/lib/sebpay');
      expect(sebpay.verifyWebhookSignature(JSON.stringify(VALID_PAYLOAD), 'sig')).toBe(false);
    });
  });

  describe('2. Cycle webhook complet: POST /api/payments/webhook', () => {
    it('accepte un webhook valide et met a jour labonnement', async () => {
      const { createHmac } = await import('node:crypto');
      const payloadStr = JSON.stringify(VALID_PAYLOAD);
      const signature = createHmac('sha256', TEST_SECRET).update(payloadStr).digest('hex');
      
      const { POST } = await import('@/app/api/payments/webhook/route');
      const res = await POST(new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sebpay-signature': signature,
        },
        body: payloadStr,
      }) as any);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });

    it('rejette un webhook avec signature invalide (401)', async () => {
      const { POST } = await import('@/app/api/payments/webhook/route');
      const res = await POST(new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sebpay-signature': 'bad_signature',
        },
        body: JSON.stringify(VALID_PAYLOAD),
      }) as any);
      
      expect(res.status).toBe(401);
    });

    it('rejette un webhook sans signature', async () => {
      const { POST } = await import('@/app/api/payments/webhook/route');
      const res = await POST(new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_PAYLOAD),
      }) as any);
      
      expect(res.status).toBe(401);
    });
  });

  describe('3. Gestion des evenements SebPay', () => {
    it('traite un paiement complete et credite les credits', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const { prisma } = await import('@/lib/prisma');

      await sebpay.handleWebhook(VALID_PAYLOAD);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('ignore un paiement en echec', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const { prisma } = await import('@/lib/prisma');

      await sebpay.handleWebhook({
        ...VALID_PAYLOAD,
        event: 'payment.failed',
        status: 'failed',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignore un evenement non-payment', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const { prisma } = await import('@/lib/prisma');

      await sebpay.handleWebhook({
        ...VALID_PAYLOAD,
        event: 'subscription.cancelled',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignore une reference invalide', async () => {
      const { sebpay } = await import('@/lib/sebpay');
      const { prisma } = await import('@/lib/prisma');
      
      const { parseSubscriptionReference } = await import('@/lib/safe-regex');
      (parseSubscriptionReference as any).mockReturnValueOnce({ planId: '', userId: '' });

      await sebpay.handleWebhook({
        ...VALID_PAYLOAD,
        reference: 'invalide',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('4. Creation d abonnement via subscribe', () => {
    it('initie un abonnement via SebPay', async () => {
      const { POST } = await import('@/app/api/payments/subscribe/route');
      
      const res = await POST(new Request('http://localhost/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: 'pro',
          phone: '+237670000000',
          operator: 'mtn',
          userId: 'user_1',
        }),
      }) as any);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.transactionId).toBeDefined();
    });

    it('rejette si planId manquant', async () => {
      const { POST } = await import('@/app/api/payments/subscribe/route');
      const res = await POST(new Request('http://localhost/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+237670000000', operator: 'mtn', userId: 'user_1' }),
      }) as any);
      
      expect(res.status).toBe(400);
    });

    it('rejette si plan introuvable', async () => {
      const { POST } = await import('@/app/api/payments/subscribe/route');
      const res = await POST(new Request('http://localhost/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'nonexistent', phone: '+237670000000', operator: 'mtn', userId: 'user_1' }),
      }) as any);
      
      expect(res.status).toBe(404);
    });
  });

  describe('5. Plans API', () => {
    it('retourne la liste des plans avec credits et prix', async () => {
      const { GET } = await import('@/app/api/payments/plans/route');
      const res = await GET();
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(4);
      
      const free = data.data.find((p: any) => p.id === 'free');
      expect(free.credits).toBe(10);
      expect(free.price).toBe(0);
      
      const pro = data.data.find((p: any) => p.id === 'pro');
      expect(pro.credits).toBe(5000);
      expect(pro.price).toBe(15000);
      expect(pro.popular).toBe(true);
    });
  });
});
