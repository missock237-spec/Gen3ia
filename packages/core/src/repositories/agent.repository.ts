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

/** Convertit un filtre objet en liste de WhereOp (ignore `id`). */
function toWhere(filter?: Record<string, unknown>): WhereOp[] | undefined {
  if (!filter) return undefined;
  const ops = Object.entries(filter)
    .filter(([k]) => k !== 'id')
    .map(([field, value]) => ({ field, op: '==' as const, value }));
  return ops.length > 0 ? ops : undefined;
}

export class AgentRepository extends BaseRepository<AgentRecord> {
  constructor() {
    super('agents');
  }

  /** Surcharge acceptant `WhereOp[]` (héritée) ou `Record<string, unknown>` (Prisma-like). */
  async count(where?: WhereOp[] | Record<string, unknown>): Promise<number> {
    const ops = Array.isArray(where) ? where : toWhere(where as Record<string, unknown> | undefined);
    return super.count(ops);
  }
}

export class ExecutionRepository extends BaseRepository<ExecutionRecord> {
  constructor() {
    super('agent_usage');
  }

  /** Surcharge acceptant `WhereOp[]` (héritée) ou `Record<string, unknown>` (Prisma-like). */
  async count(where?: WhereOp[] | Record<string, unknown>): Promise<number> {
    const ops = Array.isArray(where) ? where : toWhere(where as Record<string, unknown> | undefined);
    return super.count(ops);
  }
}

export const agentRepository = new AgentRepository();
export const executionRepository = new ExecutionRepository();
