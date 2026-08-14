import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({ verify: vi.fn(() => ({ userId: 'user_123' })) }));

vi.mock('@/lib/payment/chariow', () => ({
  chariow: {
    isConfigured: vi.fn(() => true),
    initiateCheckout: vi.fn(),
    verifyWebhookSignature: vi.fn(() => true),
    handleWebhook: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { update: vi.fn() },
    creditTransaction: { create: vi.fn() },
    invoice: { create: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

const mockChariow = require('@/lib/payment/chariow').chariow;

describe('/api/payments — Checkout Chariow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret-32-characters-minimum!!';
    mockChariow.isConfigured.mockReturnValue(true);
  });

  function post(body: any) {
    return new Request('http://localhost/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid.token' },
      body: JSON.stringify(body),
    });
  }

  it('devrait retourner 401 sans auth', async () => {
    const { POST } = await import('@/app/api/payments/checkout/route');
    const res = await POST(new Request('http://localhost/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(401);
  });

  it('devrait initier un checkout Chariow pour un plan payant', async () => {
    process.env.CHARIOW_PRODUCT_PLAN_PRO = 'prod_pro';
    mockChariow.initiateCheckout.mockResolvedValueOnce({
      step: 'payment',
      saleId: 'sale_1',
      checkoutUrl: 'https://checkout.chariow.com/x',
    });

    const { POST } = await import('@/app/api/payments/checkout/route');
    const res = await POST(post({ type: 'plan', id: 'pro' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transactionId).toBe('sale_1');
    expect(mockChariow.initiateCheckout).toHaveBeenCalledTimes(1);
  });

  it('devrait activer directement le plan gratuit', async () => {
    const { POST } = await import('@/app/api/payments/checkout/route');
    const res = await POST(post({ type: 'plan', id: 'free' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockChariow.initiateCheckout).not.toHaveBeenCalled();
  });

  it('devrait initier un checkout pour un pack de crédits', async () => {
    process.env.CHARIOW_PRODUCT_CREDITS_MEDIUM = 'prod_cred_medium';
    mockChariow.initiateCheckout.mockResolvedValueOnce({
      step: 'payment',
      saleId: 'sale_cred',
      checkoutUrl: 'https://checkout.chariow.com/x',
    });

    const { POST } = await import('@/app/api/payments/checkout/route');
    const res = await POST(post({ type: 'credits', id: 'medium' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.transactionId).toBe('sale_cred');
  });

  it('devrait rejeter un plan invalide', async () => {
    const { POST } = await import('@/app/api/payments/checkout/route');
    const res = await POST(post({ type: 'plan', id: 'inexistant' }));
    expect(res.status).toBe(400);
  });

  it('devrait rejeter un type invalide', async () => {
    const { POST } = await import('@/app/api/payments/checkout/route');
    const res = await POST(post({ type: 'crypto', id: 'x' }));
    expect(res.status).toBe(400);
  });
});
