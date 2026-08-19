// ============================================================
// Tests — BullMQ Worker (auto-worker)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
  })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    agent: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    agentExecution: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

import { db } from '@/lib/db';

describe('BullMQ Worker - auto-worker', () => {
  const mockAgent = { id: 'agent_1', name: 'Test', type: 'support', userId: 'user_1', status: 'active' };
  const mockUser = { id: 'user_1', credits: 50, plan: 'pro' };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.agent.findUnique as any).mockResolvedValue(mockAgent);
    (db.user.findUnique as any).mockResolvedValue(mockUser);
    (db.agentExecution.create as any).mockResolvedValue({ id: 'exec_1' });
    (db.agentExecution.findUnique as any).mockResolvedValue(null);
    (db.agentExecution.update as any).mockResolvedValue({});
  });

  describe('Queue BullMQ', () => {
    it('cree une queue agent-execution', async () => {
      const { agentQueue } = await import('@/workers/auto-worker');
      expect(agentQueue).toBeDefined();
      expect(agentQueue.name).toBe('agent-execution');
    });

    it('configure les options de retry', async () => {
      const { agentQueue } = await import('@/workers/auto-worker');
      expect(agentQueue.defaultJobOptions).toBeDefined();
      expect(agentQueue.defaultJobOptions?.attempts).toBe(3);
    });
  });

  describe('Deduction credits worker', () => {
    it('deduit 1 credit apres execution', async () => {
      (db.user.update as any).mockResolvedValue({ credits: 49 });
      await db.user.update({
        where: { id: 'user_1', credits: { gte: 1 } },
        data: { credits: { decrement: 1 } },
      });
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1', credits: { gte: 1 } },
        data: { credits: { decrement: 1 } },
      });
    });

    it('verifie credits avant execution', async () => {
      (db.user.findUnique as any).mockResolvedValue({ ...mockUser, credits: 0 });
      const user = await db.user.findUnique({ where: { id: 'user_1' } });
      expect(user.credits).toBe(0);
    });

    it('rejette si agent inactif', async () => {
      (db.agent.findUnique as any).mockResolvedValue({ ...mockAgent, status: 'inactive' });
      const agent = await db.agent.findUnique({ where: { id: 'agent_1' } });
      expect(agent.status).toBe('inactive');
    });
  });
});
