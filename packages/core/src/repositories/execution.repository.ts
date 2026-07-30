// ============================================================
// ExecutionRepository — Suivi des executions d'agents
// ============================================================

import { BaseRepository } from './base.repository';

export interface ExecutionData {
  id: string;
  agentId: string;
  userId: string;
  task: string;
  status: string;
  result: string | null;
  error: string | null;
  provider: string;
  sessionId: string | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExecutionInput {
  agentId: string;
  userId: string;
  task: string;
  status: string;
  provider: string;
  sessionId?: string | null;
}

export interface UpdateExecutionInput {
  status?: string;
  result?: string;
  error?: string;
  totalTokens?: number;
  estimatedCost?: number;
  completedAt?: Date;
}

class ExecutionRepository extends BaseRepository<ExecutionData, CreateExecutionInput, UpdateExecutionInput> {
  protected tableName = 'agentExecution';

  async findByAgentId(agentId: string): Promise<ExecutionData[]> {
    return this.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } });
  }

  async findByUserId(userId: string): Promise<ExecutionData[]> {
    return this.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async countByStatus(status: string): Promise<number> {
    return this.count({ status });
  }
}

export const executionRepository = new ExecutionRepository();
