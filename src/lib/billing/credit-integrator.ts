// ============================================================
// CREDIT INTEGRATOR — Pont entre le moteur de crédits,
// les décisions d'exécution des agents et le routage
// des fournisseurs en fonction du coût
// ============================================================

import { db } from '@/lib/db';
import { getCreditEngine, CreditCost, TaskCategory, TASK_EFFORT_MULTIPLIER } from './credit-engine';
import { createLogger } from '@/lib/logger';

const log = createLogger('credit-integrator');
const engine = getCreditEngine();

// ============================================================
// Types
// ============================================================

export interface ExecutionBudget {
  maxCredits: number;
  currentSpent: number;
  remaining: number;
  canProceed: boolean;
  recommendedProvider?: string;
  recommendedModel?: string;
}

export interface ProviderSelection {
  provider: string;
  model: string;
  estimatedCost: CreditCost;
  reason: string;
  latency: 'fast' | 'balanced' | 'powerful';
}

// ============================================================
// Budget utilisateur
// ============================================================

/**
 * Vérifie si l'utilisateur a assez de crédits et retourne
 * le fournisseur le plus adapté à son budget
 */
export async function checkExecutionBudget(
  userId: string,
  category: TaskCategory,
  estimatedTokens?: number
): Promise<ExecutionBudget> {
  const balance = await engine.getUserBalance(userId);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const plan = user?.plan || 'free';
  const maxCreditsPerExecution: Record<string, number> = {
    free: 100,
    starter: 500,
    pro: 5000,
    enterprise: 50000,
  };

  const maxCredits = maxCreditsPerExecution[plan] || 100;

  // Estimer le coût
  const estimatedCost = engine.calculateTaskCost(category, {
    tokensUsed: estimatedTokens,
    provider: 'openai',
    model: 'gpt-4o-mini',
  });

  const currentSpent = await getSessionSpent(userId);
  const remaining = Math.max(0, maxCredits - currentSpent);
  const canProceed = estimatedCost.credits <= remaining && estimatedCost.credits <= balance;

  // Recommander le meilleur fournisseur selon le budget
  const selection = await selectOptimalProvider(userId, category, estimatedTokens);

  log.info('Budget check', {
    userId: userId.slice(0, 8),
    plan,
    balance,
    estimatedCredits: estimatedCost.credits,
    canProceed,
    recommendedProvider: selection?.provider,
  });

  return {
    maxCredits,
    currentSpent,
    remaining,
    canProceed,
    recommendedProvider: selection?.provider,
    recommendedModel: selection?.model,
  };
}

/**
 * Calcule le montant dépensé dans la session en cours
 */
async function getSessionSpent(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db.creditTransaction.aggregate({
    where: {
      userId,
      type: 'debit',
      createdAt: { gte: today },
    },
    _sum: { amount: true },
  });

// @ts-ignore
  return Math.abs(result._sum.amount || 0);
}

// ============================================================
// Sélection intelligente du fournisseur
// ============================================================

const PROVIDER_RANKING = {
  'openai/gpt-4o-mini':         { cost: 0.00015, speed: 0.9, capacity: 'high' },
  'groq/llama-3.1-8b':          { cost: 0.00005, speed: 1.0, capacity: 'high' },
  'groq/llama-3.3-70b':         { cost: 0.00059, speed: 0.85, capacity: 'high' },
  'openai/gpt-4o':              { cost: 0.0025,  speed: 0.7, capacity: 'high' },
  'anthropic/claude-3-haiku':   { cost: 0.00025, speed: 0.8, capacity: 'medium' },
  'anthropic/claude-3.5-sonnet':{ cost: 0.003,   speed: 0.6, capacity: 'medium' },
  'anthropic/claude-4-sonnet':  { cost: 0.015,   speed: 0.5, capacity: 'low' },
  'openai/o3-mini':             { cost: 0.0011,  speed: 0.65, capacity: 'medium' },
};

const CATEGORY_CAPABILITY_REQUIREMENTS: Record<TaskCategory, {
  minQuality: 'low' | 'medium' | 'high';
  preferSpeed: boolean;
  maxCostPerQuery: number;
}> = {
  'chat':                { minQuality: 'low',    preferSpeed: true,  maxCostPerQuery: 0.001 },
  'analysis':            { minQuality: 'high',   preferSpeed: false, maxCostPerQuery: 0.005 },
  'reasoning':           { minQuality: 'high',   preferSpeed: false, maxCostPerQuery: 0.01 },
  'code':                { minQuality: 'high',   preferSpeed: false, maxCostPerQuery: 0.005 },
  'image_generation':    { minQuality: 'medium', preferSpeed: false, maxCostPerQuery: 0.05 },
  'video_generation':    { minQuality: 'medium', preferSpeed: false, maxCostPerQuery: 0.20 },
  'audio_generation':    { minQuality: 'medium', preferSpeed: true,  maxCostPerQuery: 0.01 },
  'voice_call':          { minQuality: 'low',    preferSpeed: true,  maxCostPerQuery: 0.05 },
  'browser_automation':  { minQuality: 'medium', preferSpeed: true,  maxCostPerQuery: 0.003 },
  'web_search':          { minQuality: 'low',    preferSpeed: true,  maxCostPerQuery: 0.0005 },
  'tool_execution':      { minQuality: 'low',    preferSpeed: true,  maxCostPerQuery: 0.001 },
  'memory_operation':    { minQuality: 'low',    preferSpeed: true,  maxCostPerQuery: 0.0003 },
  'workflow':            { minQuality: 'medium', preferSpeed: false, maxCostPerQuery: 0.003 },
  'agent_orchestration': { minQuality: 'high',   preferSpeed: false, maxCostPerQuery: 0.01 },
};

export async function selectOptimalProvider(
  userId: string,
  category: TaskCategory,
  estimatedTokens: number = 500
): Promise<ProviderSelection> {
  const balance = await engine.getUserBalance(userId);
  const requirements = CATEGORY_CAPABILITY_REQUIREMENTS[category];
  const effortMultiplier = TASK_EFFORT_MULTIPLIER[category] || 1.0;

  let bestProvider: string | null = null;
  let bestModel: string | null = null;
  let bestScore = -Infinity;
  let bestReason = '';

  for (const [key, ranking] of Object.entries(PROVIDER_RANKING)) {
    const [provider, model] = key.split('/');

    // Vérifier la capacité
    const capacityScore: Record<string, number> = { low: 1, medium: 2, high: 3 };
    if (capacityScore[ranking.capacity] < capacityScore[requirements.minQuality]) {
      continue;
    }

    // Calculer le coût estimé
    const cost = engine.calculateLlmCost(provider, model, Math.floor(estimatedTokens * 0.75), Math.floor(estimatedTokens * 0.25));

    // Vérifier le budget
    if (cost.credits > balance * 0.5) {
      continue;
    }

    // Vérifier le coût max par requête
    if (cost.usd * effortMultiplier > requirements.maxCostPerQuery) {
      continue;
    }

    // Score de sélection
    const speedScore = requirements.preferSpeed ? ranking.speed : 1.0;
    const costEfficiency = 1 / (1 + cost.usd * 1000);
    const score = speedScore * 0.4 + costEfficiency * 0.3 + (1 / ranking.cost) * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestProvider = provider;
      bestModel = model;
      bestReason = requirements.preferSpeed
        ? 'Priorité vitesse'
        : cost.credits < 10
          ? 'Meilleur rapport qualité/prix'
          : 'Haute qualité recommandée';
    }
  }

  if (!bestProvider || !bestModel) {
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
// @ts-ignore
      estimatedCost: engine.calculateLlmCost('openai', 'gpt-4o-mini', 100, 50),
      reason: 'Fallback par défaut',
      latency: 'balanced',
    };
  }

  const estimatedCost = engine.calculateLlmCost(bestProvider, bestModel, Math.floor(estimatedTokens * 0.75), Math.floor(estimatedTokens * 0.25));

  const latency: 'fast' | 'balanced' | 'powerful' =
    PROVIDER_RANKING[`${bestProvider}/${bestModel}`]?.speed >= 0.85 ? 'fast'
    : PROVIDER_RANKING[`${bestProvider}/${bestModel}`]?.speed >= 0.6 ? 'balanced'
    : 'powerful';

  return {
    provider: bestProvider,
    model: bestModel,
// @ts-ignore
    estimatedCost,
    reason: bestReason,
    latency,
  };
}

// ============================================================
// Déduction automatique après exécution
// ============================================================

/**
 * Déduit automatiquement les crédits après l'exécution d'une tâche
 * en fonction du coût réel du fournisseur utilisé
 */
export async function deductForExecution(params: {
  userId: string;
  agentId?: string;
  executionId?: string;
  action: string;
  category: TaskCategory;
  provider?: string;
  model?: string;
  tokensUsed?: number;
  durationMs?: number;
  toolCalls?: number;
}): Promise<{ success: boolean; credits: number; usd: number }> {
  const cost = engine.calculateTaskCost(params.category, {
    tokensUsed: params.tokensUsed,
    durationMs: params.durationMs,
    toolCalls: params.toolCalls,
    provider: params.provider,
    model: params.model,
  });

  const result = await engine.deductCredits(params.userId, cost, {
    action: params.action,
    category: params.category,
    agentId: params.agentId,
    resourceId: params.executionId,
    provider: params.provider,
    model: params.model,
  });

  log.info('Auto-deducted for execution', {
    userId: params.userId.slice(0, 8),
    action: params.action,
    credits: cost.credits,
    usd: cost.usdCost,
    success: result.success,
  });

  return {
    success: result.success,
    credits: cost.credits,
    usd: cost.usdCost,
  };
}

/**
 * Déduit les crédits pour un appel vocal
 */
export async function deductForVoiceCall(params: {
  userId: string;
  agentId: string;
  callSid: string;
  durationSeconds: number;
  provider: string;
}): Promise<{ success: boolean; credits: number; usd: number }> {
  const cost = engine.calculateVoiceCallCost(params.durationSeconds, params.provider);

  const result = await engine.deductCredits(params.userId, cost, {
    action: 'voice_call',
    category: 'voice_call',
    agentId: params.agentId,
    resourceId: params.callSid,
    provider: params.provider,
    model: params.provider,
  });

  return {
    success: result.success,
    credits: cost.credits,
    usd: cost.usdCost,
  };
}

/**
 * Déduit les crédits pour une génération média
 */
export async function deductForMediaGeneration(params: {
  userId: string;
  type: 'image' | 'video';
  provider: string;
  model: string;
  generationId: string;
  parameters?: { width?: number; height?: number; frames?: number };
}): Promise<{ success: boolean; credits: number; usd: number }> {
  const cost = engine.calculateMediaCost(params.type, params.provider, params.model, params.parameters);

  const result = await engine.deductCredits(params.userId, cost, {
    action: `${params.type}_generation`,
    category: params.type === 'image' ? 'image_generation' : 'video_generation',
    resourceId: params.generationId,
    provider: params.provider,
    model: params.model,
  });

  return {
    success: result.success,
    credits: cost.credits,
    usd: cost.usdCost,
  };
}
