// ============================================================
// AgentRepository — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = { agent: {} };
vi.mock('../db.js', () => ({ db }));
vi.mock('../logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { agentRepository } from './agent.repository.js';

const agents = [
  { id: 'a1', userId: 'u1', status: 'active', createdAt: new Date() },
  { id: 'a2', userId: 'u1', status: 'inactive', createdAt: new Date() },
];

beforeEach(() => {
  db.agent.findMany = vi.fn().mockResolvedValue(agents);
});

describe('AgentRepository', () => {
  describe('findByUserId', () => {
    it('returns agents ordered by createdAt desc', async () => {
      const res = await agentRepository.findByUserId('u1');
      expect(res).toHaveLength(2);
      expect(db.agent.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' }, orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findActiveByUserId', () => {
    it('filters to active agents', async () => {
      const res = await agentRepository.findActiveByUserId('u1');
      expect(db.agent.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', status: 'active' }, orderBy: { createdAt: 'desc' },
      });
    });
  });
});
