import { BaseRepository, WhereOp } from './base.repository.js';

// ============================================================
// AgentRepository — collection Firestore 'agents'
// Executions stockées dans 'agent_usage' (miroir)
// ============================================================

export interface AgentRecord extends Record<string, unknown> {
  id: string;
  name?: string;
  userId?: string;
  status?: string;
  isPublic?: boolean;
  createdAt?: Date;
}

export interface ExecutionRecord extends Record<string, unknown> {
  id: string;
  agentId?: string;
  userId?: string;
  status?: string;
  task?: string;
  provider?: string;
  sessionId?: string | null;
  createdAt?: Date;
}

function toWhere(filter: Record<string, unknown>): WhereOp[] {
  return Object.entries(filter)
    .filter(([k]) => k !== 'id')
    .map(([field, value]) => ({ field, op: '==' as const, value }));
}

export class AgentRepository extends BaseRepository<AgentRecord> {
  constructor() {
    super('agents');
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return super.count(filter ? toWhere(filter) : undefined);
  }
}

export class ExecutionRepository extends BaseRepository<ExecutionRecord> {
  constructor() {
    super('agent_usage');
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return super.count(filter ? toWhere(filter) : undefined);
  }
}

export const agentRepository = new AgentRepository();
export const executionRepository = new ExecutionRepository();
