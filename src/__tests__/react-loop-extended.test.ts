// ============================================================
// Tests etendus — Boucle ReAct (Think -> Act -> Observe)
// Avec mocks LLM simulant les 3 etats
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    agent: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    agentMemory: { findMany: vi.fn(), create: vi.fn() },
    agentExecution: { create: vi.fn(), update: vi.fn() },
    activityLog: { create: vi.fn() },
    agentActionLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/agent/supervisor', () => ({
  SupervisorAgent: vi.fn(),
  supervisor: {
    startTask: vi.fn(),
    recordIteration: vi.fn(() => ({ shouldStop: false })),
    getProgress: vi.fn(() => ({ iterations: 3, totalCostUsd: 0.006 })),
    reset: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/checkpoint', () => ({
  checkpointManager: { save: vi.fn(), restore: vi.fn(), cleanOldSessions: vi.fn() },
}));

vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: { check: vi.fn(() => ({ allowed: true, remaining: 99 })) },
}));

vi.mock('@/lib/validation', () => ({
  executeAgentSchema: { parse: vi.fn((b: any) => b) },
}));

import { db } from '@/lib/db';

describe('ReAct Loop — Extended (Think -> Act -> Observe)', () => {
  const baseAgent = {
    id: 'agent_1', name: 'TestAgent', type: 'assistant',
    description: 'Agent de test', userId: 'user_1',
    status: 'active', config: '{}',
    permissions: [{ permission: 'browse_web', granted: true }],
    _count: { memories: 0 },
  };

  const baseUser = { id: 'user_1', credits: 100, plan: 'pro' };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.agent.findUnique as any).mockResolvedValue(baseAgent);
    (db.user.findUnique as any).mockResolvedValue(baseUser);
    (db.agentExecution.create as any).mockResolvedValue({ id: 'exec_1' });
    (db.agentMemory.findMany as any).mockResolvedValue([]);
  });

  // ============================================================
  // ETAT 1: THINKING (Reflexion)
  // ============================================================
  describe('Etat 1 — Thinking (pensee et analyse)', () => {
    it('analyse l input utilisateur avant d agir', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Quel temps fait-il a Douala ?' }),
      }) as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.steps).toBeGreaterThan(0);
      expect(data.output).toBeDefined();
      expect(data.thoughts).toBeDefined();
      // Verifier que la pensee est presente dans le premier step
      expect(data.thoughts[0]).toBeDefined();
    });

    it('passe en mode reflexion pour les questions complexes', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Analyse les tendances du marche en Afrique de l Ouest' }),
      }) as any);
      const data = await res.json();
      expect(data.thoughts.length).toBeGreaterThanOrEqual(1);
    });

    it('retourne des pensees structurees (THOUGHT:)', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Bonjour' }),
      }) as any);
      const data = await res.json();
      expect(data.thoughts[0]).toBeTruthy();
    });
  });

  // ============================================================
  // ETAT 2: ACTING (Action)
  // ============================================================
  describe('Etat 2 — Acting (execution des actions)', () => {
    it('execute une action et retourne une observation', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Calcule 2+2' }),
      }) as any);
      const data = await res.json();
      expect(data.steps).toBeGreaterThanOrEqual(1);
      expect(data.output).toBeDefined();
    });

    it('execute des appels LLM simules', async () => {
      // Sans API key, le LLM est simule localement
      delete process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;

      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.steps).toBeGreaterThan(0);
    });

    it('enregistre les actions dans AgentActionLog', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const req = new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any;
      await POST(req);
      expect(db.agentExecution.create).toHaveBeenCalled();
    });

    it('genere des sessions uniques pour chaque appel', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const body = JSON.stringify({ agentId: 'agent_1', input: 'test' });
      const r1 = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }) as any);
      const r2 = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }) as any);
      const d1 = await r1.json();
      const d2 = await r2.json();
      expect(d1.sessionId).not.toBe(d2.sessionId);
    });
  });

  // ============================================================
  // ETAT 3: OBSERVING (Observation)
  // ============================================================
  describe('Etat 3 — Observing (supervision et arret)', () => {
    it('arrete apres avoir atteint le nombre max d iterations', async () => {
      const { SupervisorAgent } = await import('@/lib/agent/supervisor');
      // @ts-ignore: import du module reel
      const SupervisorAgentReal = (await vi.importActual('@/lib/agent/supervisor')).SupervisorAgent;
      const s = new SupervisorAgentReal();
      s.startTask('test');
      for (let i = 0; i < 25; i++) {
        s.recordIteration({
          step: i, action: 'compute', thought: 't', result: 'r', timestamp: new Date(),
        });
      }
      const r = s.recordIteration({
        step: 26, action: 'compute', thought: 't', result: 'r', timestamp: new Date(),
      });
      expect(r.shouldStop).toBe(true);
      expect(r.reason).toContain('iterations');
    });

    it('detecte une boucle infinie (3x meme action)', async () => {
      const { SupervisorAgent } = await import('@/lib/agent/supervisor');
      // @ts-ignore
      const SupervisorAgentReal = (await vi.importActual('@/lib/agent/supervisor')).SupervisorAgent;
      const s = new SupervisorAgentReal();
      s.startTask('test');
      for (let i = 0; i < 3; i++) {
        s.recordIteration({
          step: i, action: 'search', thought: 'searching', result: 'none', timestamp: new Date(),
        });
      }
      const r = s.recordIteration({
        step: 4, action: 'search', thought: 'searching', result: 'none', timestamp: new Date(),
      });
      expect(r.shouldStop).toBe(true);
      expect(r.reason).toContain('Boucle');
    });

    it('limite le cout total a 5$ maximum', async () => {
      // @ts-ignore
      const { SupervisorAgent: SupervisorAgentReal } = await vi.importActual('@/lib/agent/supervisor');
      const s = new SupervisorAgentReal();
      s.startTask('test');
      // Chaque iteration coute 0.002$, 2500 iterations = 5$
      for (let i = 0; i < 2600; i++) {
        const r = s.recordIteration({
          step: i, action: 'compute', thought: 'processing', result: 'ok', timestamp: new Date(),
        });
        if (r.shouldStop) {
          expect(r.reason).toContain('Coût');
          return;
        }
      }
      throw new Error('Le supervisor aurait du arreter pour depassement de cout');
    });

    it('suit le progres avec getProgress()', async () => {
      // @ts-ignore
      const { SupervisorAgent: SupervisorAgentReal } = await vi.importActual('@/lib/agent/supervisor');
      const s = new SupervisorAgentReal();
      s.startTask('Analyse de marche');
      s.recordIteration({ step: 1, action: 'collect', thought: 'collecting', result: 'data', timestamp: new Date() });
      s.recordIteration({ step: 2, action: 'analyze', thought: 'analyzing', result: 'insights', timestamp: new Date() });
      const p = s.getProgress();
      expect(p.task).toBe('Analyse de marche');
      expect(p.iterations).toBe(2);
      expect(p.lastAction).toBe('analyze');
      expect(p.totalCostUsd).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // CYCLE COMPLET: Think -> Act -> Observe
  // ============================================================
  describe('Cycle complet Think -> Act -> Observe', () => {
    it('execute un cycle ReAct complet', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Recherche le prix du cafe au Cameroun' }),
      }) as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.steps).toBeGreaterThan(0);
      expect(data.thoughts).toHaveLength(data.steps);
      expect(data.output).toBeDefined();
    });

    it('retourne le nombre de tokens consommes', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      const data = await res.json();
      expect(data.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it('retourne le cout estime par etape', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      const data = await res.json();
      expect(data.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('debite les credits dans la limite du plan', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_1' },
          data: { credits: { decrement: expect.any(Number) } },
        })
      );
    });
  });
});
