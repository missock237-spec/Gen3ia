// ============================================================
// Tests — Webhooks de paiement Chariow
// (ex-SebPay : Chariow est désormais la passerelle unique)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/lib/payment/chariow', () => ({
  chariow: {
    isConfigured: vi.fn(() => true),
    verifyWebhookSignature: vi.fn(),
    handleWebhook: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { upsert: vi.fn() },
    creditTransaction: { create: vi.fn() },
    activityLog: { create: vi.fn() },
    affiliateReferral: { findFirst: vi.fn(), update: vi.fn() },
    affiliateCode: { update: vi.fn() },
  },
}));

vi.mock('@/lib/billing/credit-engine', () => ({
  getCreditEngine: () => ({ creditUser: vi.fn() }),
}));

const mockChariow = require('@/lib/payment/chariow').chariow;
const mockPrisma = require('@/lib/prisma').prisma;

describe('POST /api/payments/webhook — Chariow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait traiter un paiement complété avec succès', async () => {
    mockChariow.verifyWebhookSignature.mockReturnValueOnce(true);
    mockChariow.handleWebhook.mockResolvedValueOnce(undefined);

    const { POST } = await import('@/app/api/payments/webhook/route');
    const res = await POST(new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-chariow-signature': 'valid_signature' },
      body: JSON.stringify({ event: 'sale.completed', data: { id: 's1', status: 'completed' } }),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(mockChariow.verifyWebhookSignature).toHaveBeenCalledTimes(1);
    expect(mockChariow.handleWebhook).toHaveBeenCalledTimes(1);
  });

  it('devrait rejeter une signature invalide', async () => {
    mockChariow.verifyWebhookSignature.mockReturnValueOnce(false);

    const { POST } = await import('@/app/api/payments/webhook/route');
    const res = await POST(new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-chariow-signature': 'fake_signature' },
      body: JSON.stringify({ event: 'sale.completed' }),
    }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Signature invalide');
  });

  it('devrait rejeter un webhook sans signature', async () => {
    const { POST } = await import('@/app/api/payments/webhook/route');
    const res = await POST(new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({ event: 'sale.completed' }),
    }));

    expect(res.status).toBe(401);
  });

  it('devrait gérer les erreurs internes', async () => {
    mockChariow.verifyWebhookSignature.mockReturnValueOnce(true);
    mockChariow.handleWebhook.mockRejectedValueOnce(new Error('Erreur DB'));

    const { POST } = await import('@/app/api/payments/webhook/route');
    const res = await POST(new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-chariow-signature': 'valid_sig' },
      body: JSON.stringify({ event: 'sale.completed' }),
    }));

    expect(res.status).toBe(500);
  });
});

describe('POST /api/billing/webhook — Chariow Billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait créditer un utilisateur après paiement complété', async () => {
    mockChariow.verifyWebhookSignature.mockReturnValueOnce(true);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user_123', email: 'test@test.com' });
    mockPrisma.subscription.upsert.mockResolvedValueOnce({});
    mockPrisma.user.update.mockResolvedValueOnce({});
    mockPrisma.activityLog.create.mockResolvedValueOnce({});

    const { POST } = await import('@/app/api/billing/webhook/route');
    const res = await POST(new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      headers: { 'x-chariow-signature': 'valid_sig' },
      body: JSON.stringify({
        event: 'sale.completed',
        data: {
          id: 'sale_456',
          status: 'completed',
          metadata: { userId: 'user_123', planId: 'pro', credits: '500' },
        },
      }),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.provider).toBe('chariow');
    expect(data.plan).toBe('pro');
  });

  it('devrait ignorer un événement non completed', async () => {
    mockChariow.verifyWebhookSignature.mockReturnValueOnce(true);

    const { POST } = await import('@/app/api/billing/webhook/route');
    const res = await POST(new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      headers: { 'x-chariow-signature': 'valid_sig' },
      body: JSON.stringify({
        event: 'payment.failed',
        data: { id: 'sale_789', status: 'failed', metadata: { userId: 'user_123' } },
      }),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled();
  });
});
