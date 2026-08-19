// ============================================================
// Gen3ia Evolution Engine — Self-improvement & meta-evaluation
// ============================================================
// After each evolution cycle, the engine inspects its own
// performance (failed phases, retry counts, LLM token usage,
// recommendation accuracy) and writes SelfImprovement records
// and MetaEvaluation records to the DB. The orchestrator then
// consults these records to avoid repeating past mistakes.
// ============================================================

import { createLogger } from '@/lib/logger';
import { invokeLLM, systemMessage, userMessage } from './cost-tracker';
import { generateId, saveSelfImprovement, saveMetaEvaluation, listSelfImprovements } from './memory';
import { getEvolutionRecord } from './memory';
import type { SelfImprovementRecord, MetaEvaluation, EvolutionRecord, EvaluationResult } from './types';

const log = createLogger('evolution-meta');

const SYSTEM_PROMPT = `You are the Gen3ia Evolution Engine's self-improvement module.

Given the trace of a completed evolution run (phases executed, retry counts, LLM tokens, evaluation verdict), your job is to:
1. Identify any recurring failure pattern (e.g. "planner produced invalid JSON", "validator timed out on build").
2. Suggest a concrete change to the engine itself (e.g. "tighten planner JSON schema validation", "increase build timeout to 10 min").

Output STRICT JSON (no prose, no markdown fences):
{
  "failurePattern": "string (1 sentence)",
  "component": "planner|modifier|validator|orchestrator|prompt|template|evaluator|agent_architecture",
  "changeApplied": "string (1-2 sentences describing the suggested change)",
  "metric": "string (name of the metric to track, e.g. 'planner_json_parse_failures_per_100_runs')",
  "beforeValue": 0.0,
  "afterValue": 0.0
}

If the run was flawless, output:
{
  "failurePattern": "none",
  "component": "orchestrator",
  "changeApplied": "no change needed",
  "metric": "success_rate",
  "beforeValue": 1.0,
  "afterValue": 1.0
}`;

interface SelfImprovementLLMOutput {
  failurePattern: string;
  component: SelfImprovementRecord['component'];
  changeApplied: string;
  metric: string;
  beforeValue: number;
  afterValue: number;
}

export async function runSelfImprovement(
  evolutionId: string,
  run: EvolutionRecord
): Promise<SelfImprovementRecord | null> {
  const userPrompt = `Evolution run trace:
- id: ${run.id}
- final status: ${run.status}
- final phase: ${run.phase}
- retry count: ${run.retryCount}
- total tokens: ${run.totalTokens}
- total cost (USD): ${run.costUsd.toFixed(4)}
- total duration (ms): ${run.totalDurationMs}
- last error: ${run.lastError ?? 'none'}
- root causes found: ${run.rootCauseIds.length}
- had rollback: ${run.rollbackId ? 'yes' : 'no'}

Output STRICT JSON only.`;

  let parsed: SelfImprovementLLMOutput | null = null;
  try {
    const llmResult = await invokeLLM({
      caller: 'self-improvement',
      evolutionId,
      mode: 'analysis',
      messages: [systemMessage(SYSTEM_PROMPT), userMessage(userPrompt)],
    });
    const content = llmResult.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(content) as SelfImprovementLLMOutput;
  } catch (err) {
    log.warn('self-improvement LLM call failed', { error: String(err), evolutionId });
    return null;
  }

  if (!parsed || parsed.failurePattern === 'none') {
    log.info('no self-improvement needed', { evolutionId });
    return null;
  }

  const rec: SelfImprovementRecord = {
    id: generateId('si'),
    evolutionId,
    component: parsed.component,
    failurePattern: parsed.failurePattern,
    changeApplied: parsed.changeApplied,
    metric: parsed.metric,
    beforeValue: parsed.beforeValue,
    afterValue: parsed.afterValue,
    appliedAt: new Date().toISOString(),
  };
  await saveSelfImprovement(rec);

  log.info('self-improvement recorded', {
    evolutionId,
    component: rec.component,
    metric: rec.metric,
    before: rec.beforeValue,
    after: rec.afterValue,
  });

  return rec;
}

// ----- Meta-evaluation -----

const META_PROMPT = `You are the Gen3ia Evolution Engine's meta-evaluator.

Given the engine's decision and the outcome of an evolution run, decide:
1. Was the decision good, neutral, or bad?
2. If bad or neutral, what rule should the engine adjust to avoid repeating the mistake?

Output STRICT JSON:
{
  "decision": "string describing the decision (e.g. 'applied proposal #2 with confidence 0.7')",
  "outcome": "good|neutral|bad",
  "ruleAdjusted": "string (rule name, e.g. 'planner.min_confidence_for_auto_apply') — empty if no rule to adjust",
  "adjustment": "string (concrete change, e.g. 'raise threshold from 0.5 to 0.7')"
}

Rules:
- Do NOT suggest changes to safety primitives (auth, RBAC, audit, rollback, secrets). Those are immutable.
- Only suggest rule adjustments for cost, retry, confidence, prompt content, model selection.`;

interface MetaLLMOutput {
  decision: string;
  outcome: 'good' | 'neutral' | 'bad';
  ruleAdjusted?: string;
  adjustment?: string;
}

export async function runMetaEvaluation(
  evolutionId: string,
  run: EvolutionRecord,
  evaluation: EvaluationResult | null
): Promise<MetaEvaluation | null> {
  const userPrompt = `Evolution id: ${evolutionId}
Final status: ${run.status}
Final phase: ${run.phase}
Retry count: ${run.retryCount}
Cost (USD): ${run.costUsd.toFixed(4)}

Evaluation (if any):
${evaluation ? JSON.stringify({ verdict: evaluation.verdict, recommendation: evaluation.recommendation, confidence: evaluation.confidence }, null, 2) : 'no evaluation'}

Decision taken by the engine: ${run.status === 'rolled_back' ? 'rolled back after regression' : 'merged to target branch'}.

Output STRICT JSON only.`;

  let parsed: MetaLLMOutput | null = null;
  try {
    const llmResult = await invokeLLM({
      caller: 'meta-evaluation',
      evolutionId,
      mode: 'analysis',
      messages: [systemMessage(META_PROMPT), userMessage(userPrompt)],
    });
    const content = llmResult.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(content) as MetaLLMOutput;
  } catch (err) {
    log.warn('meta-evaluation LLM call failed', { error: String(err), evolutionId });
    return null;
  }

  if (!parsed) return null;

  const rec: MetaEvaluation = {
    id: generateId('meta'),
    evolutionId,
    decision: parsed.decision ?? 'unknown',
    outcome: parsed.outcome ?? 'neutral',
    ruleAdjusted: parsed.ruleAdjusted,
    adjustment: parsed.adjustment,
    evaluatedAt: new Date().toISOString(),
  };
  await saveMetaEvaluation(rec);

  log.info('meta-evaluation recorded', {
    evolutionId,
    outcome: rec.outcome,
    ruleAdjusted: rec.ruleAdjusted ?? 'none',
  });

  return rec;
}

// ----- History lookup -----

export async function getRecurringFailures(limit = 100): Promise<SelfImprovementRecord[]> {
  const items = await listSelfImprovements(limit);
  // Group by failurePattern to find repeats
  const counts = new Map<string, number>();
  for (const it of items) {
    counts.set(it.failurePattern, (counts.get(it.failurePattern) ?? 0) + 1);
  }
  return items.filter((it) => (counts.get(it.failurePattern) ?? 0) >= 2);
}
