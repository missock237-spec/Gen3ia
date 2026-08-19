// ============================================================
// Gen3ia Evolution Engine — Evaluation
// ============================================================
// Compares "before" and "after" metric snapshots and asks the
// LLM for a verdict: merge | hold | rollback.
// ============================================================

import { createLogger } from '@/lib/logger';
import { invokeLLM, systemMessage, userMessage } from './cost-tracker';
import { generateId, saveEvaluation, getEvolutionRecord } from './memory';
import type { EvaluationResult, MetricSample, ObservationSnapshot, ImprovementPlan } from './types';

const log = createLogger('evolution-evaluation');

// Convert an observation snapshot to a flat list of metrics
export function snapshotToMetrics(snap: ObservationSnapshot): MetricSample[] {
  return [
    {
      name: 'error_count_24h',
      value: snap.errors.length,
      unit: 'count',
      direction: 'down',
    },
    {
      name: 'incident_count_24h',
      value: snap.incidents.length,
      unit: 'count',
      direction: 'down',
    },
    {
      name: 'failed_ci_runs',
      value: snap.failedCIRuns.length,
      unit: 'count',
      direction: 'down',
    },
    {
      name: 'slow_routes_count',
      value: snap.slowRoutes.length,
      unit: 'count',
      direction: 'down',
    },
    {
      name: 'p95_max_ms',
      value: snap.slowRoutes[0]?.p95Ms ?? null,
      unit: 'ms',
      direction: 'down',
    },
    {
      name: 'llm_cost_24h_usd',
      value: snap.last24hCostUsd,
      unit: 'usd',
      direction: 'down',
    },
    {
      name: 'coverage_pct',
      value: snap.coverageDelta?.afterPct ?? null,
      unit: 'pct',
      direction: 'up',
    },
  ];
}

const SYSTEM_PROMPT = `You are the Gen3ia Evolution Engine's Evaluator.

Given BEFORE and AFTER metric samples and a summary of the change applied, your job is to produce a verdict on whether the change should be merged, held for further analysis, or rolled back. Output STRICT JSON (no prose, no markdown fences):

{
  "verdict": "1-3 sentences summarising the comparison",
  "confidence": 0.0..1.0,
  "recommendation": "merge" | "hold" | "rollback"
}

Rules:
- recommendation = "merge" only if all direction-aware metrics improved OR stayed flat AND no metric regressed by more than 20%.
- recommendation = "rollback" if any critical metric (error_count_24h, incident_count_24h, failed_ci_runs) regressed by more than 50%.
- Otherwise recommendation = "hold".
- Confidence reflects how sure you are about the verdict given the sample sizes.`;

interface EvaluatorLLMOutput {
  verdict: string;
  confidence: number;
  recommendation: 'merge' | 'hold' | 'rollback';
}

export async function evaluateEvolution(
  evolutionId: string,
  beforeSnap: ObservationSnapshot,
  afterSnap: ObservationSnapshot,
  plan: ImprovementPlan
): Promise<EvaluationResult> {
  const before = snapshotToMetrics(beforeSnap);
  const after = snapshotToMetrics(afterSnap);

  // Compute deltas
  const deltas: EvaluationResult['deltas'] = [];
  for (let i = 0; i < before.length; i++) {
    const b = before[i];
    const a = after[i];
    const bv = b.value;
    const av = a.value;
    let delta: number | null = null;
    if (bv !== null && av !== null) delta = av - bv;
    const improved = computeImproved(b, a);
    deltas.push({ name: b.name, before: bv, after: av, delta, improved });
  }

  // Ask LLM for a verdict
  const userPrompt = `Evolution id: ${evolutionId}
Change summary: ${plan.summary}
Proposals applied: ${plan.proposals.map((p) => p.title).join('; ')}

=== BEFORE metrics ===
${JSON.stringify(before, null, 2)}

=== AFTER metrics ===
${JSON.stringify(after, null, 2)}

=== Deltas ===
${JSON.stringify(deltas, null, 2)}

Output STRICT JSON only.`;

  const rec = await getEvolutionRecord(evolutionId);

  let llmOut: EvaluatorLLMOutput = {
    verdict: 'Evaluation skipped (LLM unavailable).',
    confidence: 0,
    recommendation: 'hold',
  };

  try {
    const llmResult = await invokeLLM({
      caller: 'evaluator',
      evolutionId,
      mode: 'analysis',
      messages: [systemMessage(SYSTEM_PROMPT), userMessage(userPrompt)],
    });
    const content = llmResult.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    llmOut = JSON.parse(content) as EvaluatorLLMOutput;
  } catch (err) {
    log.warn('evaluator LLM call failed, using rule-based fallback', { error: String(err), evolutionId });
  }

  // If LLM didn't return a recommendation, fall back to a rule:
  if (!llmOut.recommendation) {
    llmOut.recommendation = ruleBasedRecommendation(deltas);
  }

  const result: EvaluationResult = {
    before,
    after,
    deltas,
    verdict: llmOut.verdict ?? 'No verdict.',
    confidence: Math.max(0, Math.min(1, llmOut.confidence ?? 0)),
    recommendation: llmOut.recommendation,
  };

  await saveEvaluation({
    id: generateId('eval'),
    evolutionId,
    ...result,
  });

  log.info('evaluation complete', {
    evolutionId,
    recommendation: result.recommendation,
    confidence: result.confidence.toFixed(2),
    costUsd: rec?.costUsd?.toFixed(4) ?? '0',
  });

  return result;
}

function computeImproved(before: MetricSample, after: MetricSample): boolean {
  if (before.value === null || after.value === null) return true; // unknown — treat as neutral
  if (before.direction === 'up') return after.value >= before.value;
  if (before.direction === 'down') return after.value <= before.value;
  return true;
}

function ruleBasedRecommendation(deltas: EvaluationResult['deltas']): 'merge' | 'hold' | 'rollback' {
  // Rollback if any "down-direction" metric regressed by >50%
  for (const d of deltas) {
    if (d.before !== null && d.after !== null && d.before > 0) {
      const ratio = d.after / d.before;
      // For direction-down metrics, higher = worse
      const sample = sampleDirection(d.name);
      if (sample === 'down' && ratio > 1.5) return 'rollback';
    }
  }
  // Merge if all deltas improved or flat
  const anyRegressed = deltas.some((d) => d.improved === false);
  return anyRegressed ? 'hold' : 'merge';
}

function sampleDirection(name: string): 'up' | 'down' | 'neutral' {
  if (name.includes('cost') || name.includes('error') || name.includes('incident') || name.includes('failed') || name.includes('slow') || name.includes('p95')) {
    return 'down';
  }
  if (name.includes('coverage')) return 'up';
  return 'neutral';
}
