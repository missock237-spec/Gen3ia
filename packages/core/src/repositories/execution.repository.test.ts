// ============================================================
// ExecutionRepository — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = { agentExecution: {} };
vi.mock('../db.js', () => ({ db }));
vi.mock('../logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { executionRepository } from './execution.repository.js';

beforeEach(() => {
  db.agentExecution.findMany = vi.fn().mockResolvedValue([{ id: 'e1' }]);
  db.agentExecution.count = vi.fn().mockResolvedValue(3);
});

describe('ExecutionRepository', () => {
  describe('findByAgentId', () => {
    it('returns executions for an agent', async () => {
      await executionRepository.findByAgentId('a1');
      expect(db.agentExecution.findMany).toHaveBeenCalledWith({
        where: { agentId: 'a1' }, orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findByUserId', () => {
    it('limits to 50 latest', async () => {
      await executionRepository.findByUserId('u1');
      expect(db.agentExecution.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' }, orderBy: { createdAt: 'desc' }, take: 50,
      });
    });
  });

  describe('countByStatus', () => {
    it('counts executions by status', async () => {
      await expect(executionRepository.countByStatus('failed')).resolves.toBe(3);
      expect(db.agentExecution.count).toHaveBeenCalledWith({ where: { status: 'failed' } });
    });
  });
});
