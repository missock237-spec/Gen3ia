// ============================================================
// Tests — Webhook SebPay (paiements Mobile Money)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules
vi.mock('@/lib/sebpay', () => ({
  sebpay: {
    verifyWebhookSignature: vi.fn(),
    handleWebhook: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    creditTransaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      upsert: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

const mockSebpay = require('@/lib/sebpay').sebpay;
const mockPrisma = require('@/lib/prisma').prisma;

describe('POST /api/payments/webhook — SebPay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait traiter un paiement complété avec succès', async () => {
    mockSebpay.verifyWebhookSignature.mockReturnValueOnce(true);
    mockSebpay.handleWebhook.mockResolvedValueOnce(undefined);

    const { POST } = await import('@/app/api/payments/webhook/route');
    
    const request = new Request('http://localhost:3000/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-sebpay-signature': 'valid_signature' },
      body: JSON.stringify({
        event: 'payment.completed',
        transaction_id: 'txn_123',
        reference: 'gen3ia_user_1712345678',
        status: 'completed',
        amount: 15000,
        currency: 'XAF',
        operator: 'ORANGE_MONEY',
        phone: '691234567',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
    expect(mockSebpay.verifyWebhookSignature).toHaveBeenCalledTimes(1);
    expect(mockSebpay.handleWebhook).toHaveBeenCalledTimes(1);
  });

  it('devrait rejeter une signature invalide', async () => {
    mockSebpay.verifyWebhookSignature.mockReturnValueOnce(false);

    const { POST } = await import('@/app/api/payments/webhook/route');
    
    const request = new Request('http://localhost:3000/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-sebpay-signature': 'fake_signature' },
      body: JSON.stringify({ event: 'payment.completed' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Signature invalide');
  });

  it('devrait rejeter un webhook sans signature', async () => {
    const { POST } = await import('@/app/api/payments/webhook/route');
    
    const request = new Request('http://localhost:3000/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({ event: 'payment.completed' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('devrait gérer les erreurs internes', async () => {
    mockSebpay.verifyWebhookSignature.mockReturnValueOnce(true);
    mockSebpay.handleWebhook.mockRejectedValueOnce(new Error('Erreur DB'));

    const { POST } = await import('@/app/api/payments/webhook/route');
    
    const request = new Request('http://localhost:3000/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-sebpay-signature': 'valid_sig' },
      body: JSON.stringify({ event: 'payment.completed', transaction_id: 'txn_err' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});

describe('POST /api/billing/webhook — SebPay Billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait créditer un utilisateur après paiement complété', async () => {
    mockSebpay.verifyWebhookSignature.mockReturnValueOnce(true);
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'user_123', email: 'test@test.com' });
    mockPrisma.creditTransaction.findFirst.mockResolvedValueOnce({ balance: 100 });
    mockPrisma.creditTransaction.create.mockResolvedValueOnce({ id: 'txn_cred' });
    mockPrisma.activityLog.create.mockResolvedValueOnce({});

    const { POST } = await import('@/app/api/billing/webhook/route');
    
    const request = new Request('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      headers: { 'x-sebpay-signature': 'valid_sig' },
      body: JSON.stringify({
        event: 'payment.completed',
        transaction_id: 'txn_456',
        reference: 'gen3ia_user_1712345678',
        status: 'completed',
        amount: 5000,
        currency: 'XAF',
        operator: 'MTN_MOMO',
        phone: '691234567',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // 5000/10 = 500 crédits
    expect(mockPrisma.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 500 }),
      })
    );
  });

  it('devrait ignorer un événement non completed', async () => {
    mockSebpay.verifyWebhookSignature.mockReturnValueOnce(true);

    const { POST } = await import('@/app/api/billing/webhook/route');
    
    const request = new Request('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      headers: { 'x-sebpay-signature': 'valid_sig' },
      body: JSON.stringify({
        event: 'payment.failed',
        transaction_id: 'txn_789',
        reference: 'gen3ia_user_1',
        status: 'failed',
        amount: 1000,
        currency: 'XAF',
        operator: 'WAVE',
        phone: '771234567',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    // Aucune transaction créée
    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled();
  });
});
