// ============================================================
// Tests — SubPay -> Chariow Adapter (bridge de compatibilité)
// SubPay est supprimé : l'adaptateur délègue toute la logique à Chariow.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockVerify, mockIsConfigured } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockIsConfigured: vi.fn(),
}));

vi.mock('@/lib/payment/chariow', () => ({
  chariow: {
    verifyWebhookSignature: mockVerify,
    isConfigured: mockIsConfigured,
    initiateCheckout: vi.fn(),
    getSaleStatus: vi.fn(),
  },
}));

describe('SubPay -> Chariow Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReset();
    mockIsConfigured.mockReset().mockReturnValue(true);
  });

  describe('verifyWebhookSignature (délégation à Chariow)', () => {
    it('délègue la vérification de signature à Chariow', async () => {
      mockVerify.mockReturnValueOnce(true);
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.verifyWebhookSignature('{"a":1}', 'sig')).toBe(true);
      expect(mockVerify).toHaveBeenCalledWith('{"a":1}', 'sig');
    });

    it('rejette une signature invalide via Chariow', async () => {
      mockVerify.mockReturnValueOnce(false);
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.verifyWebhookSignature('{}', 'bad')).toBe(false);
    });

    it('rejette si Chariow retourne false pour un body modifié', async () => {
      mockVerify.mockReturnValueOnce(false);
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.verifyWebhookSignature('{"amount":1}', 'sig')).toBe(false);
    });
  });

  describe('isConfigured (état Chariow)', () => {
    it("reflète l'état de configuration Chariow", async () => {
      mockIsConfigured.mockReturnValueOnce(false);
      const { subpay } = await import('@/lib/payment/subpay');
      expect(subpay.isConfigured()).toBe(false);

      mockIsConfigured.mockReturnValueOnce(true);
      expect(subpay.isConfigured()).toBe(true);
    });
  });

  describe('SubPay API bridge', () => {
    it('retourne les providers disponibles par défaut', async () => {
      const { subpay } = await import('@/lib/payment/subpay');
      const providers = await subpay.getAvailableProviders();
      expect(providers).toContain('mtn');
      expect(providers).toContain('orange');
      expect(providers).toContain('wave');
    });
  });
});
