// ============================================================
// Gen3ia Evolution Engine — Root Cause Analysis
// ============================================================
// Given an observation snapshot, asks the LLM to identify the
// most likely root causes of the symptoms observed.
// Output is structured (RootCause[]) — not free text.
// ============================================================

import { createLogger } from '@/lib/logger';
import { invokeLLM, systemMessage, userMessage } from './cost-tracker';
import { generateId } from './memory';
import { saveRootCause } from './memory';
import type { ObservationSnapshot, RootCause } from './types';

const log = createLogger('evolution-rca');

const SYSTEM_PROMPT = `You are the Gen3ia Evolution Engine's Root Cause Analysis module.

Given an observation snapshot (recent errors, slow routes, failed CI runs, incidents), your job is to identify the most likely root causes of the symptoms. You must produce STRICT JSON (no prose, no markdown fences) of the form:

{
  "rootCauses": [
    {
      "title": "string (max 80 chars)",
      "description": "string (1-3 sentences, technical and specific)",
      "evidence": [
        { "kind": "log|error|metric|test|deploy", "source": "string", "snippet": "string (max 240 chars)", "observedAt": "ISO8601" }
      ],
      "suspectedLocations": [
        { "filePath": "repo-relative path", "lineRange": "12-45 (optional)", "symbol": "functionName (optional)", "reason": "why this location is suspected" }
      ],
      "confidence": 0.0..1.0,
      "impact": "low|medium|high|critical",
      "tags": ["e.g. null-reference, race-condition, missing-validation, ..."]
    }
  ]
}

Rules:
- Produce 1-5 root causes, ranked by (impact * confidence) descending.
- Be specific: cite real file paths from the evidence when possible.
- Never invent evidence; only quote from the snapshot.
- If you cannot identify any root cause, return { "rootCauses": [] }.`;

interface RCALLMOutput {
  rootCauses: Array<Omit<RootCause, 'id'>>;
}

export async function performRootCauseAnalysis(
  evolutionId: string,
  snapshot: ObservationSnapshot
): Promise<RootCause[]> {
  const userPrompt = `Evolution scope: ${snapshot.evolutionId}
Captured at: ${snapshot.capturedAt}
Last 24h LLM cost (USD): ${snapshot.last24hCostUsd.toFixed(4)}

=== Recent errors (top ${snapshot.errors.length}) ===
${JSON.stringify(snapshot.errors.slice(0, 20), null, 2)}

=== Slow routes (top ${snapshot.slowRoutes.length}) ===
${JSON.stringify(snapshot.slowRoutes, null, 2)}

=== Failed CI runs (top ${snapshot.failedCIRuns.length}) ===
${JSON.stringify(snapshot.failedCIRuns, null, 2)}

=== Production incidents (top ${snapshot.incidents.length}) ===
${JSON.stringify(snapshot.incidents.slice(0, 20), null, 2)}

Identify the root causes. Output STRICT JSON only.`;

  const llmResult = await invokeLLM({
    caller: 'rca',
    evolutionId,
    mode: 'analysis',
    messages: [systemMessage(SYSTEM_PROMPT), userMessage(userPrompt)],
  });

  let parsed: RCALLMOutput;
  try {
    // Strip markdown fences if the LLM added them despite instructions
    const content = llmResult.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(content) as RCALLMOutput;
    if (!parsed.rootCauses || !Array.isArray(parsed.rootCauses)) {
      throw new Error('missing rootCauses array');
    }
  } catch (err) {
    log.error('RCA LLM output not parseable', { error: String(err), content: llmResult.content.slice(0, 400) });
    return [];
  }

  const rcs: RootCause[] = [];
  for (const raw of parsed.rootCauses.slice(0, 5)) {
    const rc: RootCause = {
      id: generateId('rc'),
      title: (raw.title ?? '').slice(0, 80),
      description: raw.description ?? '',
      evidence: (raw.evidence ?? []).map((e) => ({
        kind: e.kind ?? 'log',
        source: e.source ?? 'unknown',
        snippet: (e.snippet ?? '').slice(0, 240),
        observedAt: e.observedAt ?? snapshot.capturedAt,
      })),
      suspectedLocations: raw.suspectedLocations ?? [],
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0)),
      impact: (raw.impact ?? 'low') as RootCause['impact'],
      tags: (raw.tags ?? []).slice(0, 8),
    };
    rcs.push(rc);
    await saveRootCause(rc);
  }

  log.info('RCA complete', {
    evolutionId,
    rootCauseCount: rcs.length,
    model: llmResult.model,
    tokens: llmResult.promptTokens + llmResult.completionTokens,
  });

  return rcs;
}
