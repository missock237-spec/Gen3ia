// ============================================================
// Gen3ia Evolution Engine — Cost Tracker
// ============================================================
// Wraps the AIRouter to:
//   - call chatCompletion with the right mode
//   - attribute cost/tokens to the evolution record
//   - enforce hard budget ceilings (max USD / max tokens)
//   - retry transient failures with backoff
// ============================================================

import { createAIRouter, type AIMessage } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';
import { appendCost } from './memory';
import { BUDGET_DEFAULTS, getEvolutionEnv } from './config';
import type { LLMInvocation, LLMInvocationResult } from './types';

const log = createLogger('evolution-cost');

interface RunningTotals {
  costUsd: number;
  tokens: number;
  durationMs: number;
}

const runningTotals = new Map<string, RunningTotals>();

function getTotals(evolutionId: string): RunningTotals {
  let t = runningTotals.get(evolutionId);
  if (!t) {
    t = { costUsd: 0, tokens: 0, durationMs: 0 };
    runningTotals.set(evolutionId, t);
  }
  return t;
}

export interface BudgetCheckResult {
  ok: boolean;
  reason?: string;
}

export function checkBudget(evolutionId: string): BudgetCheckResult {
  const env = getEvolutionEnv();
  const totals = getTotals(evolutionId);
  if (totals.costUsd >= env.EVOLUTION_MAX_COST_USD) {
    return { ok: false, reason: `max cost USD exceeded (${totals.costUsd.toFixed(4)} >= ${env.EVOLUTION_MAX_COST_USD})` };
  }
  if (totals.tokens >= env.EVOLUTION_MAX_TOKENS) {
    return { ok: false, reason: `max tokens exceeded (${totals.tokens} >= ${env.EVOLUTION_MAX_TOKENS})` };
  }
  return { ok: true };
}

export function getRunningTotals(evolutionId: string): Readonly<RunningTotals> {
  return getTotals(evolutionId);
}

export function resetTotals(evolutionId: string): void {
  runningTotals.delete(evolutionId);
}

// ----- LLM invocation with retries + budget enforcement -----

export async function invokeLLM(inv: LLMInvocation): Promise<LLMInvocationResult> {
  const budget = checkBudget(inv.evolutionId);
  if (!budget.ok) {
    throw new Error(`budget exhausted: ${budget.reason}`);
  }

  const router = createAIRouter(`evolution:${inv.caller}`);
  const started = Date.now();
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= BUDGET_DEFAULTS.maxLLMRetries; attempt++) {
    try {
      const response = await router.chat(inv.messages, {
        // Map our `mode` → model tier (router uses `default|fast|powerful`)
        model: inv.mode === 'fast' ? 'fast' : inv.mode === 'analysis' || inv.mode === 'reasoning' || inv.mode === 'orchestration' ? 'powerful' : 'default',
      });

      const latencyMs = Date.now() - started;
      const promptTokens = response.usage?.promptTokens ?? 0;
      const completionTokens = response.usage?.completionTokens ?? 0;
      const totalTokens = promptTokens + completionTokens;
      const costUsd = response.costUsd ?? 0;

      // Update in-memory running totals
      const totals = getTotals(inv.evolutionId);
      totals.costUsd += costUsd;
      totals.tokens += totalTokens;
      totals.durationMs += latencyMs;

      // Persist to evolution record
      await appendCost(inv.evolutionId, costUsd, totalTokens, latencyMs);

      return {
        content: response.content,
        model: response.model,
        provider: response.provider,
        promptTokens,
        completionTokens,
        costUsd,
        latencyMs,
      };
    } catch (err) {
      lastErr = err;
      log.warn('LLM invocation failed, retrying', {
        attempt,
        evolutionId: inv.evolutionId,
        error: String(err),
      });
      if (attempt < BUDGET_DEFAULTS.maxLLMRetries) {
        await sleep(BUDGET_DEFAULTS.llmRetryBackoffMs * attempt);
      }
    }
  }

  throw new Error(`LLM invocation failed after ${BUDGET_DEFAULTS.maxLLMRetries} attempts: ${String(lastErr)}`);
}

// ----- Helpers -----

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ----- Helpers to build standard messages -----

export function systemMessage(content: string): AIMessage {
  return { role: 'system', content };
}

export function userMessage(content: string): AIMessage {
  return { role: 'user', content };
}

export function assistantMessage(content: string): AIMessage {
  return { role: 'assistant', content };
}
