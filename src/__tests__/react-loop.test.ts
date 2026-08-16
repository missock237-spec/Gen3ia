import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    agent: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    agentMemory: { findMany: vi.fn(), create: vi.fn() },
    agentExecution: { create: vi.fn(), update: vi.fn() },
    agentActionLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/agent/supervisor', () => ({
  supervisor: {
    startTask: vi.fn(),
    recordIteration: vi.fn(() => ({ shouldStop: false })),
    getProgress: vi.fn(() => ({ iterations: 3, totalCostUsd: 0.006 })),
    reset: vi.fn(),
  },
  SupervisorAgent: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

vi.mock('@/lib/checkpoint', () => ({
  checkpointManager: { save: vi.fn(), restore: vi.fn() },
}));

vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: { check: vi.fn(() => ({ allowed: true })) },
}));

vi.mock('@/lib/errors', () => ({
  handleApiError: vi.fn(() => new Response('{}', { status: 500 })),
}));

import { db } from '@/lib/db';

describe('Boucle ReAct', () => {
  const mockAgent = {
    id: 'agent_1', name: 'Assistant', type: 'assistant',
    description: 'Agent test', userId: 'user_1', status: 'active',
    config: '{}',
    permissions: [{ permission: 'browse_web', granted: true }],
    _count: { memories: 0 },
  };
  const mockUser = { id: 'user_1', credits: 100, plan: 'pro' };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.agent.findUnique as any).mockResolvedValue(mockAgent);
    (db.user.findUnique as any).mockResolvedValue(mockUser);
    (db.agentExecution.create as any).mockResolvedValue({ id: 'exec_1' });
    (db.agentMemory.findMany as any).mockResolvedValue([]);
  });

  describe('Validation entrees', () => {
    it('rejette sans agentId', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'test' }),
      }) as any);
      expect(res.status).toBe(400);
    });

    it('rejette sans input', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1' }),
      }) as any);
      expect(res.status).toBe(400);
    });

    it('rejette agent inactif', async () => {
      (db.agent.findUnique as any).mockResolvedValue({ ...mockAgent, status: 'inactive' });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(400);
    });

    it('rejette agent introuvable', async () => {
      (db.agent.findUnique as any).mockResolvedValue(null);
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'x', input: 'test' }),
      }) as any);
      expect(res.status).toBe(404);
    });
  });

  describe('Execution', () => {
    it('execute avec sessionId', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'Bonjour' }),
      }) as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.sessionId).toBeDefined();
    });

    it('retourne steps > 0', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      const data = await res.json();
      expect(data.steps).toBeGreaterThan(0);
    });

    it('cree un log', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.agentExecution.create).toHaveBeenCalled();
    });
  });

  describe('Memoire', () => {
    it('recupere les memoires', async () => {
      (db.agentMemory.findMany as any).mockResolvedValue([
        { id: 'm1', role: 'user', content: 'Bonjour', timestamp: new Date() },
      ]);
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'suite' }),
      }) as any);
      expect(db.agentMemory.findMany).toHaveBeenCalled();
    });

    it('cree une memoire', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.agentMemory.create).toHaveBeenCalled();
    });
  });

  describe('Erreurs', () => {
    it('retourne 500 si DB injoignable', async () => {
      (db.agent.findUnique as any).mockRejectedValue(new Error('DB down'));
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(500);
    });

    it('rejette input trop long', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'a'.repeat(10001) }),
      }) as any);
      expect(res.status).toBe(400);
    });
  });
});
