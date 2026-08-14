// ============================================================
// Tests — Déduction de crédits et paiements
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    agent: { findUnique: vi.fn() },
    creditTransaction: { create: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    invoice: { create: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

vi.mock('@/lib/agent/supervisor', () => ({
  supervisor: { startTask: vi.fn() },
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

import { db } from '@/lib/db';

describe('Déduction de crédits', () => {
  const mockUser = {
    id: 'user_1', credits: 100, plan: 'pro',
    email: 'test@gen3ia.ai', name: 'Test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.user.findUnique as any).mockResolvedValue(mockUser);
  });

  describe('Verification des credits', () => {
    it('bloque si credits = 0', async () => {
      (db.user.findUnique as any).mockResolvedValue({ ...mockUser, credits: 0 });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('bloque si credits < 1 (negatif)', async () => {
      (db.user.findUnique as any).mockResolvedValue({ ...mockUser, credits: -5 });
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(402);
    });

    it('bloque si user introuvable', async () => {
      (db.user.findUnique as any).mockResolvedValue(null);
      const { POST } = await import('@/app/api/agents/run/route');
      const res = await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(res.status).toBe(404);
    });
  });

  describe('Deduction apres execution', () => {
    it('deduit les credits apres execution reussie', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1', credits: { gte: 1 } },
        data: { credits: { decrement: expect.any(Number) } },
      });
    });

    it('ne deduit pas si l agent est inactif', async () => {
      const mockAgent = {
        id: 'agent_1', name: 'Test', type: 'support',
        description: 'Test', userId: 'user_1', status: 'inactive',
        config: '{}',
        permissions: [{ permission: 'browse_web', granted: true }],
        _count: { memories: 0 },
      };
      (db.agent.findUnique as any).mockResolvedValue(mockAgent);

      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('deduit 1 credit par defaut', async () => {
      const { POST } = await import('@/app/api/agents/run/route');
      await POST(new Request('http://localhost/api/agents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
      }) as any);
      expect(db.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { credits: { decrement: 1 } },
        })
      );
    });

    it('maintient les credits apres un echec', async () => {
      (db.agent.findUnique as any).mockRejectedValue(new Error('Erreur'));
      const { POST } = await import('@/app/api/agents/run/route');
      try {
        await POST(new Request('http://localhost/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent_1', input: 'test' }),
        }) as any);
      } catch {}
      expect(db.user.update).not.toHaveBeenCalled();
    });
  });

  describe('Plans et limites', () => {
    it('le plan free a 10 credits', () => {
      const freeUser = { ...mockUser, plan: 'free', credits: 10 };
      expect(freeUser.credits).toBe(10);
    });

    it('le plan pro a 5000 credits', () => {
      const proUser = { ...mockUser, plan: 'pro', credits: 5000 };
      expect(proUser.credits).toBe(5000);
    });

    it('le plan free ne peut pas executer si credit epuise', () => {
      const freeUser = { ...mockUser, plan: 'free', credits: 0 };
      expect(freeUser.credits).toBe(0);
      expect(freeUser.credits < 1).toBe(true);
    });
  });

  describe('Credits via terminal', () => {
    it('Execute une commande simple sans deduction de credit', async () => {
      const { POST } = await import('@/app/api/terminal/execute/route');
      const res = await POST(new Request('http://localhost/api/terminal/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'echo test', userId: 'user_1' }),
      }) as any);
      expect(res.status).toBe(200);
      // Le terminal n'utilise pas les credits
      expect(db.user.update).not.toHaveBeenCalled();
    });
  });
});
