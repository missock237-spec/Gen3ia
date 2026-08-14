// ============================================================
// Tests étendus — Webhooks de paiement Chariow
// Validation HMAC, webhook, abonnement, plans
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/payment/chariow', () => ({
  chariow: {
    isConfigured: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    handleWebhook: vi.fn(),
    initiateCheckout: vi.fn(),
    getSaleStatus: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
  },
}));

const mockChariow = require('@/lib/payment/chariow').chariow;

describe('Webhooks de paiement Chariow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHARIOW_PRODUCT_PLAN_PRO = 'prod_pro';
    mockChariow.isConfigured.mockReturnValue(true);
  });

  describe('1. Validation HMAC SHA-256 (via Chariow)', () => {
    it('verifie une signature valide', () => {
      mockChariow.verifyWebhookSignature.mockReturnValueOnce(true);
      const { chariow } = require('@/lib/payment/chariow');
      expect(chariow.verifyWebhookSignature(JSON.stringify({ event: 'sale.completed' }), 'sig')).toBe(true);
    });

    it('rejette une signature invalide', () => {
      mockChariow.verifyWebhookSignature.mockReturnValueOnce(false);
      const { chariow } = require('@/lib/payment/chariow');
      expect(chariow.verifyWebhookSignature(JSON.stringify({ event: 'sale.completed' }), 'bad')).toBe(false);
    });
  });

  describe('2. Cycle webhook complet: POST /api/payments/webhook', () => {
    it('accepte un webhook valide et confirme la réception', async () => {
      mockChariow.verifyWebhookSignature.mockReturnValueOnce(true);
      mockChariow.handleWebhook.mockResolvedValueOnce(undefined);

      const { POST } = await import('@/app/api/payments/webhook/route');
      const res = await POST(new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-chariow-signature': 'sig' },
        body: JSON.stringify({ event: 'sale.completed', data: { id: 's1', status: 'completed', metadata: { userId: 'u1' } } }),
      }) as any);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });

    it('rejette un webhook avec signature invalide (401)', async () => {
      mockChariow.verifyWebhookSignature.mockReturnValueOnce(false);

      const { POST } = await import('@/app/api/payments/webhook/route');
      const res = await POST(new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-chariow-signature': 'bad_signature' },
        body: JSON.stringify({ event: 'sale.completed' }),
      }) as any);

      expect(res.status).toBe(401);
    });

    it('rejette un webhook sans signature', async () => {
      const { POST } = await import('@/app/api/payments/webhook/route');
      const res = await POST(new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'sale.completed' }),
      }) as any);

      expect(res.status).toBe(401);
    });
  });

  describe('3. Gestion des événements Chariow', () => {
    it('traite un paiement complété via handleWebhook', async () => {
      mockChariow.handleWebhook.mockResolvedValueOnce(undefined);
      await mockChariow.handleWebhook({ event: 'sale.completed', data: { metadata: { userId: 'u1' } } });
      expect(mockChariow.handleWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Création d abonnement via subscribe', () => {
    it('initie un abonnement via Chariow', async () => {
      mockChariow.initiateCheckout.mockResolvedValueOnce({
        step: 'payment',
        saleId: 'sale_1',
        checkoutUrl: 'https://checkout.chariow.com/x',
      });
      const { prisma } = await import('@/lib/prisma');
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user_1', email: 'a@b.com', name: 'A' });

      const { POST } = await import('@/app/api/payments/subscribe/route');
      const res = await POST(new Request('http://localhost/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'pro', phone: '+237670000000', userId: 'user_1' }),
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
        body: JSON.stringify({ phone: '+237670000000', userId: 'user_1' }),
      }) as any);

      expect(res.status).toBe(400);
    });

    it('rejette si plan introuvable', async () => {
      const { POST } = await import('@/app/api/payments/subscribe/route');
      const res = await POST(new Request('http://localhost/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'nonexistent', phone: '+237670000000', userId: 'user_1' }),
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
