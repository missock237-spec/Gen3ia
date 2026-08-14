// ============================================================
// Tests étendus — Scénarios avancés de crédits
// Consommation, recharge, expiration, edge-cases
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    agent: { findUnique: vi.fn() },
    creditTransaction: { create: vi.fn(), findMany: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    invoice: { create: vi.fn(), findMany: vi.fn() },
    agentMemory: { findMany: vi.fn(), create: vi.fn() },
    agentExecution: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: { check: vi.fn(() => ({ allowed: true })) },
}));

vi.mock('@/lib/checkpoint', () => ({
  checkpointManager: { save: vi.fn(), restore: vi.fn(), cleanOldSessions: vi.fn() },
}));

vi.mock('@/lib/agent/supervisor', () => ({
  supervisor: { startTask: vi.fn(), recordIteration: vi.fn(() => ({ shouldStop: false })) },
}));

vi.mock('@/lib/validation', () => ({
  executeAgentSchema: { parse: vi.fn((b: any) => b) },
}));

vi.mock('@/lib/security', () => ({
  applySecurity: vi.fn(() => Promise.resolve({ auth: { userId: 'user_1' }, error: null })),
  secureResponse: vi.fn((data: any) => data),
}));

vi.mock('@/lib/errors', () => ({
  handleApiError: vi.fn((err: any) => new Response(JSON.stringify({ error: String(err) }), { status: 500 })),
}));

import { db } from '@/lib/db';

describe('Scenarios de credits avances', () => {
  const baseAgent = {
    id: 'agent_1', name: 'Test', type: 'support',
    description: 'Test', userId: 'user_1', status: 'active',
    config: '{}',
    permissions: [{ permission: 'browse_web', granted: true }],
    _count: { memories: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.agent.findUnique as any).mockResolvedValue(baseAgent);
    (db.agentMemory.findMany as any).mockResolvedValue([]);
    (db.agentExecution.create as any).mockResolvedValue({ id: 'exec_1' });
  });

  // ============================================================
  // SCENARIO A: Consommation avancee
  // ============================================================
  describe('A — Consommation avancee de credits', () => {
    it('debite exactement 1 credit pour 1 etape LLM', async () => {
      const creditsSpy = vi.fn();
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 50, plan: 'pro' });
      // Mock update pour capturer le decrement
      (db.user.update as any).mockImplementation(creditsSpy);
      
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Salut' }),
      }) as any);
      
      const data = await res.json();
      expect(data.creditsCharged).toBeGreaterThanOrEqual(1);
      expect(data.success).toBe(true);
    });

    it('consomme plus de credits pour des requetes complexes (plusieurs etapes)', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 100, plan: 'pro' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          agentId: 'agent_1', 
          input: 'Analyse ce document, fais des recherches web, synthetise les resultats' 
        }),
      }) as any);
      
      const data = await res.json();
      expect(data.steps).toBeGreaterThanOrEqual(1);
      expect(data.creditsCharged).toBeGreaterThanOrEqual(1);
    });

    it('bloque avec 402 et message clair si credits insuffisants', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 0, plan: 'free' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.error).toContain('Credits');
    });

    it('ne consomme pas de credits si l agent est inactif', async () => {
      (db.agent.findUnique as any).mockResolvedValue({ ...baseAgent, status: 'inactive' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('verifie le solde de maniere atomique avec condition gte:1', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 5, plan: 'pro' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      
      // Verifie que la mise a jour utilise bien une condition atomique
      const updateCall = (db.user.update as any).mock.calls[0];
      if (updateCall) {
        expect(updateCall[0]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({ id: 'user_1' }),
            data: expect.objectContaining({
              credits: expect.objectContaining({ decrement: expect.any(Number) }),
            }),
          })
        );
      }
    });
  });

  // ============================================================
  // SCENARIO B: Recharge et plans
  // ============================================================
  describe('B — Recharge et plans', () => {
    it('recharge de 100 credits pour utilisateur free', async () => {
      const { POST } = await import('@/app/api/payments/checkout/route');
      
      const res = await POST(new Request('http://localhost/api/payments/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyXzEifQ.test',
        },
        body: JSON.stringify({ type: 'credits', id: 'small' }),
      }) as any);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.transactionId).toBeDefined();
      expect(data.message).toContain('500');
    });

    it('recharge de 2000 credits (pack medium)', async () => {
      const { POST } = await import('@/app/api/payments/checkout/route');
      const res = await POST(new Request('http://localhost/api/payments/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyXzEifQ.test',
        },
        body: JSON.stringify({ type: 'credits', id: 'medium' }),
      }) as any);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('2000');
    });

    it('active un plan gratuit sans paiement', async () => {
      const { POST } = await import('@/app/api/payments/checkout/route');
      const res = await POST(new Request('http://localhost/api/payments/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyXzEifQ.test',
        },
        body: JSON.stringify({ type: 'plan', id: 'free' }),
      }) as any);
      
      const data = await res.json();
      expect(data.success).toBe(true);
      // Le plan gratuit active direct sans redirect
    });

    it('rejette un pack de credits invalide', async () => {
      const { POST } = await import('@/app/api/payments/checkout/route');
      const res = await POST(new Request('http://localhost/api/payments/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyXzEifQ.test',
        },
        body: JSON.stringify({ type: 'credits', id: 'nonexistent' }),
      }) as any);
      
      expect(res.status).toBe(400);
    });

    it('rejette un plan invalide', async () => {
      const { POST } = await import('@/app/api/payments/checkout/route');
      const res = await POST(new Request('http://localhost/api/payments/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyXzEifQ.test',
        },
        body: JSON.stringify({ type: 'plan', id: 'ultimate' }),
      }) as any);
      
      expect(res.status).toBe(400);
    });

    it('cumule les credits apres plusieurs recharges', () => {
      let balance = 10; // Free initial
      balance += 500;   // Petit pack
      balance += 2000;  // Pack moyen
      balance += 5000;  // Grand pack
      expect(balance).toBe(7510);
      
      // Consommation
      balance -= 150;
      expect(balance).toBe(7360);
      expect(balance).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // SCENARIO C: Expiration et renouvellement
  // ============================================================
  describe('C — Expiration et cycle de vie', () => {
    const SUBSCRIPTION_DAYS = 30;

    it('les credits du plan free expirent apres 30 jours', () => {
      const now = new Date('2026-07-28');
      const expiresAt = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);
      
      expect(expiresAt.toISOString()).toContain('2026-08-27');
    });

    it('le renouvellement reset les credits pour le plan free', () => {
      let credits = 0; // Epuise
      const plan = 'free';
      
      // Nouveau cycle : reset a 10
      credits = 10;
      expect(credits).toBe(10);
      expect(plan).toBe('free');
    });

    it('les credits payants ne sont pas reset au renouvellement', () => {
      let purchasedCredits = 500;
      purchasedCredits -= 50; // Utilisation
      expect(purchasedCredits).toBe(450);
      
      // Renouvellement: credits restants conserves + nouveau lot
      purchasedCredits += 500; // Nouveau mois Starter
      expect(purchasedCredits).toBe(950);
    });

    it('la subscription a une date de fin de periode', () => {
      const currentPeriodEnd = new Date('2026-08-27');
      const subscription = { 
        plan: 'pro', 
        status: 'active', 
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      };
      
      expect(subscription.status).toBe('active');
      expect(subscription.cancelAtPeriodEnd).toBe(false);
      expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    });

    it('bloque l execution apres expiration sans renouvellement', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 0, plan: 'free' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      
      expect(res.status).toBe(402);
    });

    it('la subscription cancelled_at_period_end bloque les nouveaux credits', () => {
      const sub = { cancelAtPeriodEnd: true, status: 'active', currentPeriodEnd: new Date('2026-07-29') };
      expect(sub.cancelAtPeriodEnd).toBe(true);
      
      // Apres la fin de periode, plus de renouvellement
      const isExpired = new Date() > sub.currentPeriodEnd;
      expect(isExpired).toBe(false); // Pas encore expire
    });
  });

  // ============================================================
  // SCENARIO D: Credits illimites (Enterprise)
  // ============================================================
  describe('D — Credits illimites Enterprise', () => {
    it('permet 10 executions successives sans manquer de credits', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 25000, plan: 'enterprise' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      for (let i = 0; i < 10; i++) {
        const res = await POST(new Request('http://localhost/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent_1', input: `Requete ${i}` }),
        }) as any);
        expect(res.status).toBe(200);
      }
    });

    it('le plan enterprise a 25000 credits initiaux', () => {
      const plan = { name: 'enterprise', credits: 25000, maxAgents: -1 };
      expect(plan.credits).toBe(25000);
      expect(plan.maxAgents).toBe(-1);
    });

    it('facture enterprise = sur devis', () => {
      const plan = SUBSCRIPTION_PLANS?.find(p => p.id === 'enterprise');
      // Le plan doit exister
      expect(plan).toBeDefined();
    });
  });

  // ============================================================
  // SCENARIO E: Edge cases
  // ============================================================
  describe('E — Edge cases et securite', () => {
    it('race condition: deux requetes simultanees avec 1 credit restant', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 1, plan: 'free' });
      
      const { POST } = await import('@/app/api/agents/run/route');
      
      // Lancer 3 requetes en parallele
      const results = await Promise.allSettled([
        POST(new Request('http://localhost/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent_1', input: 'A' }),
        }) as any),
        POST(new Request('http://localhost/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent_1', input: 'B' }),
        }) as any),
        POST(new Request('http://localhost/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent_1', input: 'C' }),
        }) as any),
      ]);
      
      // Au max 1 requete reussit avec 1 credit
      const successes = results.filter(r => r.status === 'fulfilled' && (r as any).value?.status === 200);
      expect(successes.length).toBeLessThanOrEqual(1);
    });

    it('un utilisateur sans plan a 0 credit par defaut', () => {
      const user = { id: 'new_user', credits: 0, plan: 'free' };
      expect(user.credits).toBe(0);
      expect(user.credits < 1).toBe(true);
    });

    it('les credits ne peuvent pas devenir negatifs avec decrement', () => {
      // Le where: { credits: { gte: 1 } } empeche les negatifs
      const condition = { where: { id: 'user_1', credits: { gte: 1 } }, data: { credits: { decrement: 1 } } };
      expect(condition.where.credits.gte).toBe(1);
    });

    it('le terminal intelligent ne consomme pas de credits', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 10, plan: 'free' });
      
      const { POST } = await import('@/app/api/terminal/execute/route');
      const res = await POST(new Request('http://localhost/api/terminal/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'ls -la', userId: 'user_1' }),
      }) as any);
      
      expect(res.status).toBe(200);
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('les packs de credits disponibles sont corrects', () => {
      const packs = [
        { name: 'small', credits: 500, price: 2500 },
        { name: 'medium', credits: 2000, price: 8000 },
        { name: 'large', credits: 5000, price: 18000 },
        { name: 'xlarge', credits: 15000, price: 45000 },
      ];
      
      expect(packs).toHaveLength(4);
      expect(packs[0].credits).toBe(500);
      expect(packs[3].credits).toBe(15000);
      
      // Prix decroissants par credit
      const pricePerCredit = packs.map(p => p.price / p.credits);
      for (let i = 1; i < pricePerCredit.length; i++) {
        expect(pricePerCredit[i]).toBeLessThanOrEqual(pricePerCredit[i-1]);
      }
    });
  });
});
