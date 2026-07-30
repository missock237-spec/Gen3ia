// ============================================================
// Agent Service — Logique metier des agents IA
// ============================================================

import { agentRepository, executionRepository } from '../repositories/index.js';
import { creditService } from './credit.service.js';
import { ValidationError, NotFoundError, BusinessError } from '../errors.js';

interface AgentConfig {
  maxConcurrentExecutions: number;
  maxExecutionTimeMs: number;
  minCreditsRequired: number;
}

const DEFAULT_CONFIG: AgentConfig = {
  maxConcurrentExecutions: 5,
  maxExecutionTimeMs: 300000,
  minCreditsRequired: 1,
};

class AgentService {
  private config: AgentConfig = DEFAULT_CONFIG;

  async executeAgent(agentId: string, userId: string, input?: string) {
    const agent = await agentRepository.findById(agentId);
    if (!agent) throw new NotFoundError('Agent', agentId);
    if ((agent as any).status === 'inactive') {
      throw new BusinessError('AGENT_INACTIVE', `L'agent ${agentId} est inactif`);
    }
    const hasCredits = await creditService.hasSufficientCredits(userId, this.config.minCreditsRequired);
    if (!hasCredits) {
      throw new BusinessError('INSUFFICIENT_CREDITS', 'Credits insuffisants pour executer cet agent');
    }
    const execution = await executionRepository.create({
      agentId,
      userId,
      task: (input ?? '').slice(0, 500),
      status: 'running',
      provider: 'auto_scheduler',
      sessionId: null,
    });
    await creditService.deductCredits(userId, this.config.minCreditsRequired, `Execution agent ${agentId}`);
    return execution;
  }

  async validateExecution(agentId: string, userId: string): Promise<{ valid: boolean; reason?: string }> {
    const agent = await agentRepository.findById(agentId);
    if (!agent) return { valid: false, reason: 'Agent introuvable' };
    if ((agent as any).status === 'inactive') return { valid: false, reason: 'Agent inactif' };
    const hasCredits = await creditService.hasSufficientCredits(userId, this.config.minCreditsRequired);
    if (!hasCredits) return { valid: false, reason: 'Credits insuffisants' };
    const runningCount = await executionRepository.count({ agentId, status: 'running' });
    if (runningCount >= this.config.maxConcurrentExecutions) {
      return { valid: false, reason: "Limite d'executions concurrentes atteinte" };
    }
    return { valid: true };
  }

  async getAgentStats(agentId: string) {
    const agent = await agentRepository.findByIdOrThrow(agentId);
    const totalExecutions = await executionRepository.count({ agentId });
    const completedExecutions = await executionRepository.count({ agentId, status: 'completed' });
    const failedExecutions = await executionRepository.count({ agentId, status: 'failed' });
    return {
      agent,
      stats: {
        totalExecutions,
        completedExecutions,
        failedExecutions,
        successRate: totalExecutions > 0 ? (completedExecutions / totalExecutions) * 100 : 0,
      },
    };
  }
}

export const agentService = new AgentService();
