// ============================================================
// Gen3ia Evolution Engine — Improvement Planner
// ============================================================
// Given root causes + an observation snapshot, asks the LLM to
// produce a structured improvement plan (file changes + risks +
// test plan). Each proposal is annotated with a safety level.
// ============================================================

import { createLogger } from '@/lib/logger';
import { invokeLLM, systemMessage, userMessage } from './cost-tracker';
import { generateId, savePlan } from './memory';
import { inferSafetyLevel } from './config';
import type { ImprovementPlan, ImprovementProposal, RootCause, ObservationSnapshot, FileChange } from './types';

const log = createLogger('evolution-planner');

const SYSTEM_PROMPT = `You are the Gen3ia Evolution Engine's Improvement Planner.

Given a list of root causes and an observation snapshot, your job is to produce a concrete improvement plan that addresses the root causes. You must output STRICT JSON (no prose, no markdown fences) of the form:

{
  "summary": "string (1-2 sentences)",
  "globalRisks": ["string", ...],
  "verificationSteps": ["string", ...],
  "proposals": [
    {
      "title": "string (max 80 chars)",
      "summary": "string (2-4 sentences)",
      "addressesRootCauseId": "string (root cause id)",
      "fileChanges": [
        {
          "path": "repo-relative path (e.g. src/lib/foo.ts)",
          "action": "create|modify|delete",
          "diff": "unified diff (git diff format) — for modify",
          "content": "full file content — for create (omit diff if content is provided)",
          "rationale": "why this change"
        }
      ],
      "risks": ["string"],
      "testPlan": ["string (test name or assertion)"],
      "confidence": 0.0..1.0,
      "estimatedCostUsd": 0.0..10.0
    }
  ]
}

Rules:
- Produce 1-5 proposals, ranked by (impact * confidence) descending.
- Each proposal must address AT LEAST ONE root cause id from the input.
- File paths must be relative to the repo root.
- NEVER propose changes to protected paths: src/lib/firebase/auth.ts, src/lib/firebase/admin.ts, src/lib/session.ts, src/middleware.ts, .env*, vercel.json, .github/workflows/*, firestore.rules, storage.rules, src/lib/security/*, src/lib/evolution/*.
- Prefer targeted diffs over rewriting whole files.
- If a proposal touches auth, DB schema, infra, or security primitives, mark its impact as "high" or "critical".
- If you cannot produce a safe plan, return { "summary": "no safe plan", "globalRisks": [], "verificationSteps": [], "proposals": [] }.`;

interface PlannerLLMOutput {
  summary: string;
  globalRisks: string[];
  verificationSteps: string[];
  proposals: Array<Omit<ImprovementProposal, 'id' | 'requiredSafetyLevel'> & { fileChanges: FileChange[] }>;
}

export async function generateImprovementPlan(
  evolutionId: string,
  rootCauses: RootCause[],
  snapshot: ObservationSnapshot
): Promise<ImprovementPlan> {
  const userPrompt = `Evolution id: ${evolutionId}
Snapshot captured at: ${snapshot.capturedAt}
Last 24h LLM cost (USD): ${snapshot.last24hCostUsd.toFixed(4)}

=== Root causes (${rootCauses.length}) ===
${JSON.stringify(
  rootCauses.map((rc) => ({
    id: rc.id,
    title: rc.title,
    description: rc.description,
    impact: rc.impact,
    confidence: rc.confidence,
    suspectedLocations: rc.suspectedLocations,
  })),
  null,
  2
)}

Produce a concrete improvement plan. Output STRICT JSON only.`;

  const llmResult = await invokeLLM({
    caller: 'planner',
    evolutionId,
    mode: 'reasoning',
    messages: [systemMessage(SYSTEM_PROMPT), userMessage(userPrompt)],
  });

  let parsed: PlannerLLMOutput;
  try {
    const content = llmResult.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(content) as PlannerLLMOutput;
    if (!parsed.proposals || !Array.isArray(parsed.proposals)) {
      throw new Error('missing proposals array');
    }
  } catch (err) {
    log.error('Planner LLM output not parseable', { error: String(err), content: llmResult.content.slice(0, 400) });
    return emptyPlan(evolutionId, llmResult.model);
  }

  const proposals: ImprovementProposal[] = [];
  for (const raw of parsed.proposals.slice(0, 5)) {
    const fileChanges = (raw.fileChanges ?? []).slice(0, 10);
    // Infer safety level as the MAX of all file changes
    let level = 1 as 1 | 2 | 3;
    for (const fc of fileChanges) {
      const fl = inferSafetyLevel(fc.path, 'modification');
      if (fl > level) level = fl;
    }

    proposals.push({
      id: generateId('prop'),
      title: (raw.title ?? '').slice(0, 80),
      summary: raw.summary ?? '',
      addressesRootCauseId: raw.addressesRootCauseId ?? '',
      fileChanges,
      risks: (raw.risks ?? []).slice(0, 10),
      testPlan: (raw.testPlan ?? []).slice(0, 10),
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0)),
      estimatedCostUsd: Math.max(0, Math.min(10, raw.estimatedCostUsd ?? 0)),
      requiredSafetyLevel: level,
    });
  }

  const plan: ImprovementPlan = {
    id: generateId('plan'),
    evolutionId,
    summary: parsed.summary ?? '',
    proposals,
    globalRisks: (parsed.globalRisks ?? []).slice(0, 10),
    verificationSteps: (parsed.verificationSteps ?? []).slice(0, 15),
    estimatedTotalCostUsd: proposals.reduce((s, p) => s + p.estimatedCostUsd, 0),
    generatedByModel: llmResult.model,
    createdAt: new Date().toISOString(),
  };

  await savePlan(plan);

  log.info('plan generated', {
    evolutionId,
    planId: plan.id,
    proposalCount: proposals.length,
    model: llmResult.model,
    tokens: llmResult.promptTokens + llmResult.completionTokens,
  });

  return plan;
}

function emptyPlan(evolutionId: string, model: string): ImprovementPlan {
  const plan: ImprovementPlan = {
    id: generateId('plan'),
    evolutionId,
    summary: 'No safe plan could be generated.',
    proposals: [],
    globalRisks: ['planner produced no actionable proposals'],
    verificationSteps: [],
    estimatedTotalCostUsd: 0,
    generatedByModel: model,
    createdAt: new Date().toISOString(),
  };
  void savePlan(plan);
  return plan;
}
