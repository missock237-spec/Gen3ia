// Tests pour le ReAct Loop d'execution d'agent

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    agent: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    agentMemory: { findMany: vi.fn(), create: vi.fn() },
    agentExecution: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/agent/supervisor', () => ({
  supervisor: { recordIteration: vi.fn(() => ({ shouldStop: false })) },
}));

vi.mock('@/lib/checkpoint', () => ({
  checkpointManager: {
    restore: vi.fn(),
    save: vi.fn(),
    cleanOldSessions: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: { check: vi.fn(() => ({ allowed: true, remaining: 99, resetIn: 60 })) },
}));

vi.mock('@/lib/validation', () => ({
  executeAgentSchema: { parse: vi.fn((b: any) => b) },
}));

vi.mock('@/lib/errors', () => ({
  handleApiError: vi.fn((e: any) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

import { db } from '@/lib/db';

describe('POST /api/agents/run', () => {
  const mockAgent = {
    id: 'agent_1', name: 'Test', type: 'support',
    description: 'Test agent', userId: 'user_1',
    status: 'active', config: '{}',
    permissions: [{ permission: 'browse_web', granted: true }],
    _count: { memories: 0 },
  };
  const mockUser = { credits: 100, plan: 'pro' };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.agent.findUnique as any).mockResolvedValue(mockAgent);
    (db.user.findUnique as any).mockResolvedValue(mockUser);
    (db.agentMemory.findMany as any).mockResolvedValue([]);
    (db.agentExecution.create as any).mockResolvedValue({ id: 'exec_1' });
  });

  it('rejette si agentId manquant', async () => {
    const { POST } = await import('@/app/api/agents/run/route');
    const req = new Request('http://localhost/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'test' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rejette si input manquant', async () => {
    const { POST } = await import('@/app/api/agents/run/route');
    const req = new Request('http://localhost/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent_1' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('retourne 404 si agent introuvable', async () => {
    (db.agent.findUnique as any).mockResolvedValue(null);
    const { POST } = await import('@/app/api/agents/run/route');
    const req = new Request('http://localhost/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'x', input: 'test' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });

  it('retourne 402 si credits insuffisants', async () => {
    (db.user.findUnique as any).mockResolvedValue({ credits: 0 });
    const { POST } = await import('@/app/api/agents/run/route');
    const req = new Request('http://localhost/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(402);
  });

  it('execute avec succes', async () => {
    const { POST } = await import('@/app/api/agents/run/route');
    const req = new Request('http://localhost/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent_1', input: 'Bonjour' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sessionId).toBeDefined();
    expect(data.steps).toBeGreaterThan(0);
  });

  it('genere des sessionId uniques', async () => {
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

  it('debite les credits apres execution', async () => {
    const { POST } = await import('@/app/api/agents/run/route');
    const req = new Request('http://localhost/api/agents/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
    });
    await POST(req as any);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { credits: { decrement: expect.any(Number) } },
    });
  });
});

describe('Embeddings', () => {
  it('retourne des resultats vides si pas de memoire', async () => {
    const { embeddingService } = await import('@/lib/agent/embedding');
    vi.spyOn(embeddingService as any, 'embed').mockResolvedValue([0.1, 0.2, 0.3]);
    const results = await embeddingService.searchSimilar('test', 'user_1');
    // Pas de memoire en base → resultat vide
    expect(results).toEqual([]);
  });
});

describe('Supervisor', () => {
  it('ne stop pas apres une iteration normale', async () => {
    const { supervisor } = await import('@/lib/agent/supervisor');
    supervisor.startTask('test');
    const r = supervisor.recordIteration({
      step: 1, action: 'process', thought: 'test', result: 'ok',
      timestamp: new Date(),
    });
    expect(r.shouldStop).toBe(false);
  });

  it('detecte une boucle infinie', async () => {
    const { supervisor } = await import('@/lib/agent/supervisor');
    supervisor.startTask('test');
    for (let i = 0; i < 3; i++) {
      supervisor.recordIteration({
        step: i, action: 'identique', thought: 'test', result: 'ok',
        timestamp: new Date(),
      });
    }
    const r = supervisor.recordIteration({
      step: 4, action: 'identique', thought: 'test', result: 'ok',
      timestamp: new Date(),
    });
    expect(r.shouldStop).toBe(true);
    expect(r.reason).toContain('Boucle');
  });
});
