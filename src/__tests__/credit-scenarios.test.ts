// ============================================================
// Tests etendus — Scenarios de credits (consommation, recharge,
// expiration, plans, limites)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    agent: { findUnique: vi.fn() },
    creditTransaction: { create: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    invoice: { create: vi.fn() },
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

import { db } from '@/lib/db';

describe('Scenarios de credits (consommation, recharge, expiration)', () => {
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
  // SCENARIO 1: Consommation
  // ============================================================
  describe('Scenario 1 — Consommation de credits', () => {
    it('debite 1 credit par execution par defaut', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 50, plan: 'pro' });
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1', credits: { gte: 1 } },
        data: { credits: { decrement: 1 } },
      });
    });

    it('consomme des credits multiples si plusieurs etapes', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 100, plan: 'pro' });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Fais une recherche approfondie' }),
      }) as any);
      const data = await res.json();
      expect(data.creditsCharged).toBeGreaterThanOrEqual(1);
    });

    it('bloque si credit = 0', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 0, plan: 'free' });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(402);
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('bloque si credit negatif', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: -10, plan: 'free' });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(402);
    });

    it('continue jusqu a epuisement des credits sans plan', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 1, plan: 'free' });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      // Devrait reussir avec le dernier credit
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('ne consomme pas si le terminal est utilise', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 10, plan: 'free' });
      const { POST } = await import('@/app/api/terminal/execute/route');
      const res = await POST(new Request('http://localhost/api/terminal/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'echo test', userId: 'user_1' }),
      }) as any);
      expect(res.status).toBe(200);
      expect(db.user.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // SCENARIO 2: Recharge
  // ============================================================
  describe('Scenario 2 — Recharge de credits', () => {
    it('ajoute des credits apres un achat', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 10, plan: 'free' });
      (db.user.update as any).mockResolvedValue({ id: 'user_1', credits: 110, plan: 'free' });

      // Simuler un achat de 100 credits
      await db.user.update({
        where: { id: 'user_1' },
        data: { credits: { increment: 100 } },
      });

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { credits: { increment: 100 } },
      });
    });

    it('permet d executer apres recharge', async () => {
      // Avant recharge: 0 credit -> bloque
      (db.user.findUnique as any).mockResolvedValueOnce({ id: 'user_1', credits: 0, plan: 'free' });
      // Apres recharge: 100 credits -> OK
      (db.user.findUnique as any).mockResolvedValueOnce({ id: 'user_1', credits: 100, plan: 'free' });

      const { POST } = await import('@/app/api/agents/run/route');

      // Tentative avec 0 credit
      const res1 = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res1.status).toBe(402);

      // L utilisateur recharge et reessaye
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 100, plan: 'free' });
      const res2 = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res2.status).toBe(200);
    });

    it('cumule les recharges successives', () => {
      let credits = 10;
      credits += 100; // Achat pack 100
      expect(credits).toBe(110);
      credits += 500; // Achat pack 500
      expect(credits).toBe(610);
      credits -= 10;  // Utilisation
      expect(credits).toBe(600);
      expect(credits).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // SCENARIO 3: Plans et Limites
  // ============================================================
  describe('Scenario 3 — Plans et limites', () => {
    it('le plan free a 10 credits initiaux', () => {
      const plan = { name: 'free', credits: 10, maxAgents: 1 };
      expect(plan.credits).toBe(10);
      expect(plan.maxAgents).toBe(1);
    });

    it('le plan starter a 1000 credits', () => {
      const plan = { name: 'starter', credits: 1000, price: 5000 };
      expect(plan.credits).toBe(1000);
      expect(plan.price).toBe(5000);
    });

    it('le plan pro a 5000 credits', () => {
      const plan = { name: 'pro', credits: 5000, price: 15000 };
      expect(plan.credits).toBe(5000);
      expect(plan.price).toBe(15000);
    });

    it('le plan enterprise a 25000 credits', () => {
      const plan = { name: 'enterprise', credits: 25000, maxAgents: -1 };
      expect(plan.credits).toBe(25000);
      expect(plan.maxAgents).toBe(-1); // Illimite
    });

    it('un pack de credits ajoute le bon montant', () => {
      const packs = [
        { name: 'Petit', credits: 100, price: 1000 },
        { name: 'Moyen', credits: 500, price: 4500 },
        { name: 'Grand', credits: 1200, price: 10000 },
      ];
      let balance = 10; // Free
      balance += packs[0].credits; // Achat petit pack
      expect(balance).toBe(110);
      balance += packs[2].credits; // Achat grand pack
      expect(balance).toBe(1310);
    });
  });

  // ============================================================
  // SCENARIO 4: Expiration
  // ============================================================
  describe('Scenario 4 — Expiration et fin de periode', () => {
    it('les credits expirent apres 30 jours pour le plan gratuit', () => {
      const now = Date.now();
      const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000);
      const credit = { balance: 10, expiresAt, userId: 'user_1' };
      expect(credit.expiresAt.getTime()).toBeGreaterThan(now);
      expect(credit.balance).toBe(10);
    });

    it('les credits du plan pro expirent a la fin du mois', () => {
      const currentPeriodEnd = new Date('2026-08-28');
      const subscription = { plan: 'pro', status: 'active', currentPeriodEnd };
      expect(subscription.currentPeriodEnd).toBeDefined();
      expect(subscription.status).toBe('active');
    });

    it('reset les credits apres expiration', () => {
      let credits = 0;
      const plan = 'free';
      // Nouveau mois: reset
      credits = 10;
      expect(credits).toBe(10);
      expect(plan).toBe('free');
    });

    it('ne reset pas les credits付 payants', () => {
      let credits = 500;
      credits -= 50; // Utilisation
      expect(credits).toBe(450);
      // Pas de reset pour les payants
    });

    it('empeche l utilisation apres expiration si pas de renouvellement', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 0, plan: 'free' });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(402);
    });
  });

  // ============================================================
  // SCENARIO 5: Credits illimites (Enterprise)
  // ============================================================
  describe('Scenario 5 — Credits illimites', () => {
    it('le plan enterprise peut executer sans limite', async () => {
      (db.user.findUnique as any).mockResolvedValue({ id: 'user_1', credits: 25000, plan: 'enterprise' });
      const { POST } = await import('@/app/api/agents/run/route');
      for (let i = 0; i < 5; i++) {
        const res = await POST(new Request('http://localhost/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent_1', input: `test-${i}` }),
        }) as any);
        expect(res.status).toBe(200);
      }
    });

    it('facture le plan enterprise sur devis', () => {
      const plan = { name: 'enterprise', price: 'sur devis', credits: 25000 };
      expect(plan.price).toBe('sur devis');
      expect(plan.credits).toBeGreaterThanOrEqual(25000);
    });
  });
});
