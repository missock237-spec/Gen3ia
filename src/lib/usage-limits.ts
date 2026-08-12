import { db } from '@/lib/db';
import { getPlanLimit, type PlanTier } from '@/lib/billing/plans';

// ============================================================
// Usage Limits — alignés sur les plans réels (src/lib/billing/plans.ts)
// Source de vérité : Plan.limits + credits mensuels.
// Plans : free | starter | pro | enterprise | custom
// ============================================================

export interface PlanLimits {
  maxAgents: number;
  maxConcurrent: number;
  maxTokensPerDay: number;
  maxApiCallsPerDay: number;
}

/** Tokens/jour estimés depuis les crédits mensuels du plan (1 crédit ≈ 500 tokens). */
const TOKENS_PER_CREDIT = 500;

/** Nombre par défaut d'appels API par jour (reconverti depuis limits.apiCalls). */
const API_CALLS_DAILY_FACTOR = 30; // apiCalls mensuels / ~30 jours

/** Limites explicites pour les plans illimités (enterprise / custom). */
const UNLIMITED = -1;

/**
 * Calcule les limites d'un plan depuis la source de vérité `plans.ts`.
 * Retourne des nombres exploitables (les -1 = illimité sont convertis).
 */
export function getPlanLimits(plan: string): PlanLimits {
  const tier = (plan || 'free') as PlanTier;

  const agents = getPlanLimit(tier, 'agents');
  const apiCalls = getPlanLimit(tier, 'apiCalls');
  const credits = getMonthlyCredits(tier);

  return {
    // -1 (illimité) => très grand nombre pratique
    maxAgents: agents === UNLIMITED ? 1000 : agents,
    maxConcurrent: agents === UNLIMITED ? 100 : Math.max(1, Math.ceil(agents / 4)),
    maxTokensPerDay: credits === UNLIMITED
      ? 10_000_000
      : credits * TOKENS_PER_CREDIT,
    maxApiCallsPerDay: apiCalls === UNLIMITED
      ? 1_000_000
      : Math.max(100, Math.round(apiCalls / API_CALLS_DAILY_FACTOR)),
  };
}

/** Crédits mensuels du plan (source : PLAN_CREDITS dans plans.ts). */
function getMonthlyCredits(tier: PlanTier): number {
  switch (tier) {
    case 'free': return 100;
    case 'starter': return 1000;
    case 'pro': return 5000;
    case 'enterprise':
    case 'custom': return UNLIMITED;
    default: return 100;
  }
}

export async function getActiveAgentCount(userId: string): Promise<number> {
  return db.agent.count({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'status', op: '==', value: 'active' },
    ],
  });
}

export async function getTotalAgentCount(userId: string): Promise<number> {
  return db.agent.count({ where: [{ field: 'userId', op: '==', value: userId }] });
}

export async function getDailyTokenUsage(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  // aggregate() non supporté par la façade -> lecture + calcul en mémoire
  const rows = await db.aiCost.findMany({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'createdAt', op: '>=', value: startOfDay },
    ],
  });
  const total = rows.reduce((sum: number, r) => sum + (Number((r as Record<string, unknown>).totalTokens) || 0), 0);
  return total;
}

export async function getDailyApiCallCount(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db.agentInvocation.count({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'createdAt', op: '>=', value: startOfDay },
    ],
  }).catch(() => 0);
}

export async function checkConcurrentAgents(userId: string, plan: string, isMultiAgent = false) {
  if (isMultiAgent) return { allowed: true, current: 0, limit: -1 };
  const limits = getPlanLimits(plan);
  const current = await getActiveAgentCount(userId);
  return { allowed: current < limits.maxConcurrent, current, limit: limits.maxConcurrent };
}

export async function checkAgentLimit(userId: string, plan: string) {
  const limits = getPlanLimits(plan);
  const current = await getTotalAgentCount(userId);
  return { allowed: current < limits.maxAgents, current, limit: limits.maxAgents };
}

export async function checkTokenLimit(userId: string, plan: string) {
  const limits = getPlanLimits(plan);
  const current = await getDailyTokenUsage(userId);
  return { allowed: current < limits.maxTokensPerDay, current, limit: limits.maxTokensPerDay };
}

export async function checkApiCallLimit(userId: string, plan: string) {
  const limits = getPlanLimits(plan);
  const current = await getDailyApiCallCount(userId);
  return { allowed: current < limits.maxApiCallsPerDay, current, limit: limits.maxApiCallsPerDay };
}

export type AgentAction = 'activate' | 'create' | 'chat';

export async function validateAgentAction(userId: string, plan: string, action: AgentAction, isMultiAgent = false) {
  switch (action) {
    case 'activate': {
      const c = await checkConcurrentAgents(userId, plan, isMultiAgent);
      if (!c.allowed) return { allowed: false, reason: `Limite (${c.current}/${c.limit})` };
      return { allowed: true };
    }
    case 'create': {
      const c = await checkAgentLimit(userId, plan);
      if (!c.allowed) return { allowed: false, reason: `Limite (${c.current}/${c.limit})` };
      return { allowed: true };
    }
    case 'chat': {
      const c = await checkTokenLimit(userId, plan);
      if (!c.allowed) return { allowed: false, reason: `Limite (${c.current}/${c.limit})` };
      return { allowed: true };
    }
    default: return { allowed: true };
  }
}