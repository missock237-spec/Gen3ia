// ============================================================
// AgentService — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const agentRepository = { findById: vi.fn(), findByIdOrThrow: vi.fn() };
const executionRepository = { create: vi.fn(), count: vi.fn() };
const creditService = { hasSufficientCredits: vi.fn(), deductCredits: vi.fn() };

vi.mock('../repositories/index.js', () => ({ agentRepository, executionRepository }));
vi.mock('./credit.service.js', () => ({ creditService }));

import { agentService } from './agent.service.js';
import { BusinessError, NotFoundError } from '../errors.js';

describe('AgentService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('executeAgent', () => {
    it('executes an active agent with sufficient credits', async () => {
      agentRepository.findById.mockResolvedValue({ id: 'a1', status: 'active' });
      creditService.hasSufficientCredits.mockResolvedValue(true);
      executionRepository.create.mockResolvedValue({ id: 'e1', status: 'running' });
      creditService.deductCredits.mockResolvedValue({});

      const res = await agentService.executeAgent('a1', 'u1', 'hello');
      expect(res).toEqual({ id: 'e1', status: 'running' });
      expect(executionRepository.create).toHaveBeenCalledWith({
        agentId: 'a1', userId: 'u1', task: 'hello', status: 'running', provider: 'auto_scheduler', sessionId: null,
      });
      expect(creditService.deductCredits).toHaveBeenCalledWith('u1', 1, 'Execution agent a1');
    });

    it('throws NotFoundError when agent missing', async () => {
      agentRepository.findById.mockResolvedValue(null);
      await expect(agentService.executeAgent('a1', 'u1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws BusinessError when agent inactive', async () => {
      agentRepository.findById.mockResolvedValue({ id: 'a1', status: 'inactive' });
      await expect(agentService.executeAgent('a1', 'u1')).rejects.toBeInstanceOf(BusinessError);
    });

    it('throws BusinessError when credits insufficient', async () => {
      agentRepository.findById.mockResolvedValue({ id: 'a1', status: 'active' });
      creditService.hasSufficientCredits.mockResolvedValue(false);
      await expect(agentService.executeAgent('a1', 'u1')).rejects.toBeInstanceOf(BusinessError);
    });
  });

  describe('validateExecution', () => {
    it('returns invalid when agent missing', async () => {
      agentRepository.findById.mockResolvedValue(null);
      await expect(agentService.validateExecution('a1', 'u1')).resolves.toEqual({ valid: false, reason: 'Agent introuvable' });
    });

    it('returns valid when all constraints pass', async () => {
      agentRepository.findById.mockResolvedValue({ id: 'a1', status: 'active' });
      creditService.hasSufficientCredits.mockResolvedValue(true);
      executionRepository.count.mockResolvedValue(1);
      await expect(agentService.validateExecution('a1', 'u1')).resolves.toEqual({ valid: true });
    });

    it('returns invalid when concurrent limit reached', async () => {
      agentRepository.findById.mockResolvedValue({ id: 'a1', status: 'active' });
      creditService.hasSufficientCredits.mockResolvedValue(true);
      executionRepository.count.mockResolvedValue(5);
      await expect(agentService.validateExecution('a1', 'u1')).resolves.toEqual({ valid: false, reason: 'Limite atteinte' });
    });
  });

  describe('getAgentStats', () => {
    it('computes success rate', async () => {
      agentRepository.findByIdOrThrow.mockResolvedValue({ id: 'a1' });
      executionRepository.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(8)   // completed
        .mockResolvedValueOnce(2);  // failed
      const res = await agentService.getAgentStats('a1');
      expect(res.stats.totalExecutions).toBe(10);
      expect(res.stats.completedExecutions).toBe(8);
      expect(res.stats.failedExecutions).toBe(2);
      expect(res.stats.successRate).toBe(80);
    });
  });
});
