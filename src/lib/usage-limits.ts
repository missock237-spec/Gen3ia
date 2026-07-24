import { db } from '@/lib/db';

export interface PlanLimits {
  maxAgents: number;
  maxConcurrent: number;
  maxTokensPerDay: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { maxAgents: 3, maxConcurrent: 1, maxTokensPerDay: 50000 },
  pro: { maxAgents: 20, maxConcurrent: 5, maxTokensPerDay: 500000 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function getActiveAgentCount(userId: string): Promise<number> {
  return db.agent.count({ where: { userId, status: 'active' } });
}

export async function getTotalAgentCount(userId: string): Promise<number> {
  return db.agent.count({ where: { userId } });
}

export async function getDailyTokenUsage(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const result = await db.aICost.aggregate({
    where: { userId, createdAt: { gte: startOfDay } },
    _sum: { totalTokens: true },
  });
  return result._sum.totalTokens || 0;
}

export async function checkConcurrentAgents(
  userId: string, plan: string, isMultiAgent = false
): Promise<{ allowed: boolean; current: number; limit: number }> {
  if (isMultiAgent) return { allowed: true, current: 0, limit: -1 };
  const limits = getPlanLimits(plan);
  const current = await getActiveAgentCount(userId);
  return { allowed: current < limits.maxConcurrent, current, limit: limits.maxConcurrent };
}

export async function checkAgentLimit(userId: string, plan: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = getPlanLimits(plan);
  const current = await getTotalAgentCount(userId);
  return { allowed: current < limits.maxAgents, current, limit: limits.maxAgents };
}

export async function checkTokenLimit(userId: string, plan: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = getPlanLimits(plan);
  const current = await getDailyTokenUsage(userId);
  return { allowed: current < limits.maxTokensPerDay, current, limit: limits.maxTokensPerDay };
}

export type AgentAction = 'activate' | 'create' | 'chat';

export async function validateAgentAction(userId: string, plan: string, action: AgentAction, isMultiAgent = false) {
  switch (action) {
    case 'activate': {
      const check = await checkConcurrentAgents(userId, plan, isMultiAgent);
      if (!check.allowed) return { allowed: false, reason: `Limite d'agents concurrents atteinte (${check.current}/${check.limit})` };
      return { allowed: true };
    }
    case 'create': {
      const check = await checkAgentLimit(userId, plan);
      if (!check.allowed) return { allowed: false, reason: `Limite d'agents atteinte (${check.current}/${check.limit})` };
      return { allowed: true };
    }
    case 'chat': {
      const check = await checkTokenLimit(userId, plan);
      if (!check.allowed) return { allowed: false, reason: `Limite de tokens atteinte (${check.current.toLocaleString()}/${check.limit.toLocaleString()})` };
      return { allowed: true };
    }
    default: return { allowed: true };
  }
}
