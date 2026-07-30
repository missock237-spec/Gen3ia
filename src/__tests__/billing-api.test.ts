// ============================================================
// Tests — API Billing (crédits, plans, factures)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  db: {
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
    creditTransaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    credit: {
      findFirst: vi.fn(),
    },
    agentExecution: {
      aggregate: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@/lib/security', () => ({
  applySecurity: vi.fn(),
  secureResponse: (res: any) => res,
}));

const mockDb = require('@/lib/db').db;
const mockSecurity = require('@/lib/security');

describe('Billing API — GET /api/billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSecurity.applySecurity.mockResolvedValue({
      auth: { userId: 'user_test_123', role: 'user' },
      error: null,
    });

    mockDb.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      cancelAtPeriodEnd: false,
      userId: 'user_test_123',
    });

    mockDb.invoice.findMany.mockResolvedValue([
      { id: 'inv_1', amount: 15000, currency: 'XAF', status: 'paid', createdAt: new Date(), userId: 'user_test_123' },
    ]);

    mockDb.creditTransaction.findMany.mockResolvedValue([
      { id: 'txn_1', type: 'purchase', amount: 5000, description: 'Achat credits', createdAt: new Date(), userId: 'user_test_123' },
    ]);

    mockDb.credit.findFirst.mockResolvedValue({
      balance: 4500,
      used: 500,
      total: 5000,
      expiresAt: null,
    });

    mockDb.agentExecution.aggregate.mockResolvedValue({
      _count: { id: 42 },
      _sum: { estimatedCost: 0.05, totalTokens: 15000 },
    });
  });

  it('devrait retourner les données de facturation complètes', async () => {
    const { GET } = await import('@/app/api/billing/route');
    const request = new Request('http://localhost:3000/api/billing');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.subscription.plan).toBe('pro');
    expect(data.data.credits.balance).toBe(4500);
    expect(data.data.monthlyUsage.executions).toBe(42);
    expect(data.data.paymentMethod.provider).toBe('SebPay');
    expect(data.data.paymentMethod.methods).toContain('Orange Money');
  });

  it('devrait retourner 401 si non authentifié', async () => {
    mockSecurity.applySecurity.mockResolvedValueOnce({
      auth: null,
      error: new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 }),
    });

    const { GET } = await import('@/app/api/billing/route');
    const request = new Request('http://localhost:3000/api/billing');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('devrait retourner des crédits par défaut si aucun', async () => {
    mockDb.credit.findFirst.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/billing/route');
    const request = new Request('http://localhost:3000/api/billing');
    const response = await GET(request);
    const data = await response.json();

    expect(data.data.credits.balance).toBe(0);
    expect(data.data.credits.total).toBe(0);
  });
});

describe('Credit Transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devrait créer une transaction de débit', async () => {
    const { deductCredits } = await import('@/lib/billing/credits');
    
    mockDb.creditTransaction.findFirst.mockResolvedValueOnce({ balance: 1000 });
    mockDb.subscription.findFirst.mockResolvedValueOnce({ plan: 'pro' });
    mockDb.creditTransaction.create.mockResolvedValueOnce({ id: 'txn_debit_1' });

    const result = await deductCredits({
      userId: 'user_1',
      amount: 100,
      resourceType: 'agent_run',
      description: 'Test deduction',
    });

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(900);
  });

  it('devrait rejeter une déduction si solde insuffisant', async () => {
    const { deductCredits } = await import('@/lib/billing/credits');
    
    mockDb.creditTransaction.findFirst.mockResolvedValueOnce({ balance: 10 });
    mockDb.subscription.findFirst.mockResolvedValueOnce({ plan: 'free' });

    const result = await deductCredits({
      userId: 'user_1',
      amount: 100,
      resourceType: 'agent_run',
    });

    expect(result.success).toBe(false);
    expect(result.newBalance).toBe(10);
  });

  it('devrait donner des crédits illimités pour Enterprise', async () => {
    const { getCreditBalance } = await import('@/lib/billing/credits');
    
    mockDb.subscription.findFirst.mockResolvedValueOnce({ plan: 'enterprise' });

    const balance = await getCreditBalance('user_enterprise');
    expect(balance).toBe(-1); // -1 = illimité
  });
});

describe('Subscription Plans', () => {
  it('devrait retourner les bons prix pour chaque plan', async () => {
    const { PLANS } = await import('@/lib/billing/plans');
    
    const free = PLANS.find(p => p.id === 'free');
    expect(free?.price).toBe(0);
    expect(free?.sebpayPlanId).toBe('');

    const pro = PLANS.find(p => p.id === 'pro');
    expect(pro?.price).toBe(15000);
    expect(pro?.priceUSD).toBe(29.99);
    expect(pro?.highlighted).toBe(true);
  });

  it('devrait comparer les plans correctement', async () => {
    const { comparePlans } = await import('@/lib/billing/plans');
    
    const upgrade = comparePlans('free', 'pro');
    expect(upgrade.isUpgrade).toBe(true);
    expect(upgrade.priceDifference).toBe(15000);

    const same = comparePlans('free', 'free');
    expect(same.isSame).toBe(true);
  });

  it('devrait vérifier les features des plans', async () => {
    const { hasPlanFeature } = await import('@/lib/billing/plans');
    
    expect(hasPlanFeature('free', 'Priority support')).toBe(false);
    expect(hasPlanFeature('pro', 'Priority support')).toBe(true);
  });
});
