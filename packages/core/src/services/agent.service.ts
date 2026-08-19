import { agentRepository, executionRepository } from '../repositories/index.js';
import { creditService } from './credit.service.js';
import { NotFoundError, BusinessError } from '../errors.js';

class AgentService {
  private config = { maxConcurrentExecutions: 5, maxExecutionTimeMs: 300000, minCreditsRequired: 1 };

  async executeAgent(agentId: string, userId: string, input?: string) {
    const agent = await agentRepository.findById(agentId);
    if (!agent) throw new NotFoundError('Agent', agentId);
    if ((agent as any).status === 'inactive') throw new BusinessError('AGENT_INACTIVE', 'Agent inactif');
    const hasCredits = await creditService.hasSufficientCredits(userId, this.config.minCreditsRequired);
    if (!hasCredits) throw new BusinessError('INSUFFICIENT_CREDITS', 'Credits insuffisants');
    const execution = await executionRepository.create({ agentId, userId, task: (input ?? '').slice(0, 500), status: 'running', provider: 'auto_scheduler', sessionId: null });
    await creditService.deductCredits(userId, this.config.minCreditsRequired, 'Execution agent ' + agentId);
    return execution;
  }

  async validateExecution(agentId: string, userId: string) {
    const agent = await agentRepository.findById(agentId);
    if (!agent) return { valid: false, reason: 'Agent introuvable' };
    if ((agent as any).status === 'inactive') return { valid: false, reason: 'Agent inactif' };
    const hasCredits = await creditService.hasSufficientCredits(userId, this.config.minCreditsRequired);
    if (!hasCredits) return { valid: false, reason: 'Credits insuffisants' };
    const running = await executionRepository.count({ agentId, status: 'running' });
    if (running >= this.config.maxConcurrentExecutions) return { valid: false, reason: 'Limite atteinte' };
    return { valid: true };
  }

  async getAgentStats(agentId: string) {
    const agent = await agentRepository.findByIdOrThrow(agentId);
    const total = await executionRepository.count({ agentId });
    const completed = await executionRepository.count({ agentId, status: 'completed' });
    const failed = await executionRepository.count({ agentId, status: 'failed' });
    return { agent, stats: { totalExecutions: total, completedExecutions: completed, failedExecutions: failed, successRate: total > 0 ? (completed / total) * 100 : 0 } };
  }
}

export const agentService = new AgentService();
