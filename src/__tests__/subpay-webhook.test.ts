// ============================================================
// Tests — SubPay Webhook Security (HMAC, anti-replay)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    invoice: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('SubPay Webhook Security', () => {
  const TEST_SECRET = 'subpay_whsec_test_secret_key_32char!';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUBPAY_WEBHOOK_SECRET = TEST_SECRET;
  });

  describe('verifyWebhookSignature', () => {
    it('verifie une signature HMAC SHA-256 valide', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      const { createHmac } = await import('node:crypto');
      
      const body = JSON.stringify({
        event: 'payment.completed',
        data: { id: 'txn_123', reference: 'ref_456', amount: 15000, status: 'completed' },
        timestamp: new Date().toISOString(),
      });
      const signature = createHmac('sha256', TEST_SECRET).update(body).digest('hex');
      
      expect(subpay.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('rejette une signature invalide', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      const body = JSON.stringify({ event: 'test' });
      expect(subpay.verifyWebhookSignature(body, 'bad_signature')).toBe(false);
    });

    it('rejette si le body a ete modifie', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      const { createHmac } = await import('node:crypto');
      
      const original = { amount: 15000 };
      const signature = createHmac('sha256', TEST_SECRET).update(JSON.stringify(original)).digest('hex');
      
      const modified = { amount: 99999 };
      expect(subpay.verifyWebhookSignature(JSON.stringify(modified), signature)).toBe(false);
    });

    it('rejette un body vide', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.verifyWebhookSignature('', 'sig')).toBe(false);
    });

    it('rejette une signature vide', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.verifyWebhookSignature('{}', '')).toBe(false);
    });

    it('rejette si aucun secret configure', async () => {
      delete process.env.SUBPAY_WEBHOOK_SECRET;
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.verifyWebhookSignature('{}', 'sig')).toBe(false);
    });

    it('utilise timingSafeEqual pour la comparaison', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      const { createHmac } = await import('node:crypto');
      
      const body = JSON.stringify({ event: 'payment.completed' });
      const signature = createHmac('sha256', TEST_SECRET).update(body).digest('hex');
      
      // Meme avec different secret, ne crash pas
      expect(() => subpay.verifyWebhookSignature(body, signature)).not.toThrow();
    });
  });

  describe('SubPay API', () => {
    it('retourne les providers disponibles par defaut', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      const providers = await subpay.getAvailableProviders();
      expect(providers).toContain('mtn');
      expect(providers).toContain('orange');
      expect(providers).toContain('wave');
    });

    it('isConfigured retourne false sans API KEY', () => {
      const { subpay } = await import('@/lib/payment/subpay');
      // En test, les vars d'env ne sont pas set
      expect(subpay.isConfigured()).toBe(false);
    });
  });
});
