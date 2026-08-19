// ============================================================
// Gen3ia Evolution Engine — Orchestrator
// ============================================================
// Single entry-point for a full evolution cycle.
//
//   observe → analyse (RCA) → plan → safety gate → modify →
//   validate → evaluate → review (PR) → deploy → monitor → learn
//
// State machine with retries + rollback. Crash-safe: the lock
// acquired at start survives if the process dies, and is reaped
// on next start by `reapCrashedRuns()`.
// ============================================================

import { createLogger } from '@/lib/logger';
import { recordAudit } from '@/lib/security/audit-trail';
import {
  createEvolutionRecord,
  updateEvolutionRecord,
  setEvolutionStatus,
  setEvolutionPhase,
  createStep,
  completeStep,
  saveSnapshot,
  getEvolutionRecord,
  updateEvolutionRecord as updateRec,
  appendCost,
  createRollback,
  updateRollback,
} from './memory';
import { acquireLock, releaseLock, startHeartbeat, reapCrashedRuns } from './concurrency';
import { captureObservation } from './observation';
import { performRootCauseAnalysis } from './rca';
import { generateImprovementPlan } from './planner';
import { applyImprovementPlan } from './modifier';
import { runValidationPipeline } from './validation';
import { evaluateEvolution } from './evaluation';
import { enforceSafetyGate, enforcePreMergeGate } from './safety';
import { runSelfImprovement, runMetaEvaluation } from './self-improvement';
import {
  ensureBranchFromTarget,
  makeEvolutionBranchName,
  pushBranch,
  createPullRequest,
  mergePullRequest,
  revertMergeCommit,
  getHeadSha,
} from './git';
import { getEvolutionEnv, RETRY_DEFAULTS } from './config';
import { checkBudget } from './cost-tracker';
import type {
  EvolutionRecord,
  ImprovementPlan,
  ObservationSnapshot,
  EvaluationResult,
  RootCause,
  EvolutionPhase,
} from './types';

const log = createLogger('evolution-orchestrator');

export interface StartEvolutionInput {
  triggeredBy: string;
  scope: string;
  motivation: string;
  targetBranch?: string;
}

export async function startEvolution(input: StartEvolutionInput): Promise<EvolutionRecord> {
  const env = getEvolutionEnv();
  if (!env.EVOLUTION_ENABLED) {
    throw new Error('Evolution Engine is disabled (EVOLUTION_ENABLED=0)');
  }

  // 1. Create the record
  const targetBranch = input.targetBranch ?? env.EVOLUTION_TARGET_BRANCH;
  const sourceBranch = makeEvolutionBranchName(input.scope, input.motivation);
  const record = await createEvolutionRecord({
    triggeredBy: input.triggeredBy,
    targetBranch,
    sourceBranch,
    scope: input.scope,
    motivation: input.motivation,
    lockToken: undefined,
  });

  // 2. Acquire concurrency lock
  const token = await acquireLock(record.id);
  if (!token) {
    await setEvolutionStatus(record.id, 'skipped', { lastError: 'concurrency limit reached' });
    return record;
  }
  await updateRec(record.id, { lockToken: token });

  // 3. Audit
  await recordAudit({
    action: 'EVOLUTION_TRIGGERED',
    actorId: input.triggeredBy,
    actorType: input.triggeredBy === 'system' ? 'system' : 'user',
    targetId: record.id,
    targetType: 'evolution',
    description: `Evolution ${record.id} triggered (scope=${input.scope})`,
    severity: 'warning',
    metadata: { sourceBranch, targetBranch, scope: input.scope, motivation: input.motivation },
  });

  log.info('evolution started', { id: record.id, scope: input.scope, sourceBranch, targetBranch });

  return record;
}

export async function runEvolutionCycle(evolutionId: string): Promise<EvolutionRecord> {
  const record0 = await getEvolutionRecord(evolutionId);
  if (!record0) throw new Error(`evolution ${evolutionId} not found`);
  if (record0.status === 'running') {
    log.warn('evolution already running', { id: evolutionId });
    return record0;
  }

  const stopHeartbeat = startHeartbeat(evolutionId, record0.lockToken ?? '');
  let lastErr: unknown = null;
  let attempt = 0;

  try {
    for (attempt = 1; attempt <= RETRY_DEFAULTS.maxRetries + 1; attempt++) {
      try {
        await runPipeline(evolutionId);
        // success
        return (await getEvolutionRecord(evolutionId))!;
      } catch (err) {
        lastErr = err;
        const budget = checkBudget(evolutionId);
        if (!budget.ok) {
          log.error('budget exhausted — aborting', { evolutionId, reason: budget.reason });
          await setEvolutionStatus(evolutionId, 'failed', { lastError: `budget: ${budget.reason}` });
          break;
        }
        if (attempt > RETRY_DEFAULTS.maxRetries) {
          log.error('max retries exceeded', { evolutionId, attempt, error: String(err) });
          break;
        }
        log.warn('pipeline failed, retrying', { evolutionId, attempt, error: String(err) });
        await updateRec(evolutionId, { retryCount: attempt });
        await sleep(RETRY_DEFAULTS.backoffMs * attempt);
      }
    }

    // Final failure
    await setEvolutionStatus(evolutionId, 'failed', {
      lastError: `after ${attempt - 1} retries: ${String(lastErr)}`,
    });
    await recordAudit({
          action: 'EVOLUTION_FAILED',
      actorId: 'evolution-engine',
      actorType: 'system',
      targetId: evolutionId,
      targetType: 'evolution',
      description: `Evolution ${evolutionId} failed: ${String(lastErr)}`,
      severity: 'error',
    });
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? 'unknown'));
  } finally {
    stopHeartbeat();
    if (record0.lockToken) {
      await releaseLock(evolutionId, record0.lockToken);
    }
  }
}

async function runPipeline(evolutionId: string): Promise<void> {
  // PHASE 1 — Observation
  await setEvolutionPhase(evolutionId, 'observation');
  const step1 = await createStep(evolutionId, 'observation');
  const beforeSnap = await captureObservation(evolutionId);
  await saveSnapshot(beforeSnap);
  await completeStep(step1.id, 'success', { durationMs: 0 });

  // PHASE 2 — RCA
  await setEvolutionPhase(evolutionId, 'analysis');
  const step2 = await createStep(evolutionId, 'analysis');
  const rootCauses = await performRootCauseAnalysis(evolutionId, beforeSnap);
  await updateRec(evolutionId, { rootCauseIds: rootCauses.map((r) => r.id) });
  await completeStep(step2.id, rootCauses.length ? 'success' : 'skipped', { durationMs: 0 });

  if (rootCauses.length === 0) {
    log.info('no root causes found — skipping rest of pipeline', { evolutionId });
    await setEvolutionStatus(evolutionId, 'skipped', { lastError: 'no root causes found' });
    return;
  }

  // PHASE 3 — Planning
  await setEvolutionPhase(evolutionId, 'planning');
  const step3 = await createStep(evolutionId, 'planning');
  const plan = await generateImprovementPlan(evolutionId, rootCauses, beforeSnap);
  await completeStep(step3.id, plan.proposals.length ? 'success' : 'skipped', { durationMs: 0 });

  if (plan.proposals.length === 0) {
    log.info('planner produced no proposals — skipping', { evolutionId });
    await setEvolutionStatus(evolutionId, 'skipped', { lastError: 'no proposals produced' });
    return;
  }

  // PHASE 4 — Safety gate
  const gate = await enforceSafetyGate(evolutionId, plan);
  if (!gate.ok) {
    if (gate.awaitingHumanApproval) {
      log.info('awaiting L3 human approval', { evolutionId });
      // status already set to 'awaiting_review' inside enforceSafetyGate
      return;
    }
    throw new Error(`safety gate blocked: ${gate.reason}`);
  }

  // PHASE 5 — Modification
  await setEvolutionPhase(evolutionId, 'modification');
  const step5 = await createStep(evolutionId, 'modification');
  const rec = await getEvolutionRecord(evolutionId);
  if (!rec) throw new Error('record disappeared');
  await ensureBranchFromTarget(rec.sourceBranch, rec.targetBranch);
  const applyResult = await applyImprovementPlan(evolutionId, plan);
  await pushBranch(rec.sourceBranch, false);
  const headSha = await getHeadSha(rec.sourceBranch);
  await updateRec(evolutionId, { headSha });
  await completeStep(step5.id, 'success', {
    durationMs: 0,
    outputTail: applyResult.diffStat.slice(-4096),
  });

  // PHASE 6 — Validation
  await setEvolutionPhase(evolutionId, 'validation');
  const step6 = await createStep(evolutionId, 'validation');
  const validation = await runValidationPipeline(evolutionId, {
    skipPhases: ['install'], // already installed by dev/CI
    failFast: true,
  });
  await completeStep(step6.id, validation.allPassed ? 'success' : 'failed', {
    durationMs: 0,
    outputTail: validation.results
      .map((r) => `${r.phase}: ${r.status} (exit ${r.exitCode})`)
      .join('\n')
      .slice(-4096),
  });
  if (!validation.allPassed) {
    throw new Error('validation pipeline failed');
  }

  // PHASE 7 — Evaluation (before/after snapshot)
  await setEvolutionPhase(evolutionId, 'evaluation');
  const step7 = await createStep(evolutionId, 'evaluation');
  const afterSnap = await captureObservation(evolutionId);
  await saveSnapshot(afterSnap);
  const evaluation = await evaluateEvolution(evolutionId, beforeSnap, afterSnap, plan);
  await completeStep(step7.id, 'success', {
    durationMs: 0,
    outputTail: evaluation.verdict.slice(-4096),
  });

  // PHASE 8 — Pre-merge gate + PR
  await setEvolutionPhase(evolutionId, 'review');
  const step8 = await createStep(evolutionId, 'review');
  const preMerge = await enforcePreMergeGate(evolutionId, evaluation);
  if (!preMerge.ok) {
    await completeStep(step8.id, 'failed', { error: preMerge.reason });
    throw new Error(`pre-merge gate blocked: ${preMerge.reason}`);
  }
  const pr = await createPullRequest({
    branchName: rec.sourceBranch,
    targetBranch: rec.targetBranch,
    title: `[evolution] ${plan.summary.slice(0, 60)}`,
    body: buildPRBody(evolutionId, plan, evaluation, applyResult.diffStat),
  });
  await updateRec(evolutionId, { prUrl: pr.url, prNumber: pr.number, status: 'pr_open' });
  await completeStep(step8.id, 'success', { durationMs: 0, outputTail: pr.url });

  // PHASE 9 — Deployment (merge to target)
  await setEvolutionPhase(evolutionId, 'deployment');
  const step9 = await createStep(evolutionId, 'deployment');
  // For L1/L2 we auto-merge. L3 wouldn't reach here (blocked at safety gate).
  await mergePullRequest(pr.number, 'squash');
  await updateRec(evolutionId, { status: 'pr_merged' });
  await recordAudit({
        action: 'EVOLUTION_PR_MERGED',
    actorId: 'evolution-engine',
    actorType: 'system',
    targetId: evolutionId,
    targetType: 'evolution',
    description: `Evolution ${evolutionId} PR #${pr.number} merged to ${rec.targetBranch}`,
    severity: 'warning',
    metadata: { prNumber: pr.number, prUrl: pr.url },
  });
  await completeStep(step9.id, 'success', { durationMs: 0, outputTail: pr.url });

  // PHASE 10 — Monitoring (post-merge snapshot)
  await setEvolutionPhase(evolutionId, 'monitoring');
  const step10 = await createStep(evolutionId, 'monitoring');
  // Wait briefly for production metrics to surface
  await sleep(30 * 1000);
  const postSnap = await captureObservation(evolutionId);
  await saveSnapshot(postSnap);
  // If post-merge shows a regression, rollback.
  const postEval = await evaluateEvolution(evolutionId, beforeSnap, postSnap, plan);
  if (postEval.recommendation === 'rollback') {
    log.error('post-merge regression — initiating rollback', { evolutionId });
    await triggerRollback(evolutionId, `post-merge regression: ${postEval.verdict}`);
    await completeStep(step10.id, 'rolled_back', { error: postEval.verdict });
    await setEvolutionStatus(evolutionId, 'rolled_back', { lastError: postEval.verdict });
    await runSelfImprovementAndMeta(evolutionId, postEval);
    return;
  }
  await completeStep(step10.id, 'success', { durationMs: 0, outputTail: postEval.verdict.slice(-4096) });
  await setEvolutionStatus(evolutionId, 'deployed');

  // PHASE 11 — Learning (self-improvement + meta)
  await setEvolutionPhase(evolutionId, 'learning');
  const step11 = await createStep(evolutionId, 'learning');
  await runSelfImprovementAndMeta(evolutionId, postEval);
  await completeStep(step11.id, 'success', { durationMs: 0 });
}

async function runSelfImprovementAndMeta(
  evolutionId: string,
  evaluation: EvaluationResult
): Promise<void> {
  const rec = await getEvolutionRecord(evolutionId);
  if (!rec) return;
  await runSelfImprovement(evolutionId, rec);
  await runMetaEvaluation(evolutionId, rec, evaluation);
}

export async function triggerRollback(evolutionId: string, reason: string): Promise<void> {
  const rec = await getEvolutionRecord(evolutionId);
  if (!rec) throw new Error(`evolution ${evolutionId} not found`);
  if (!rec.headSha) throw new Error('no headSha to revert');

  const rollback = await createRollback({
    evolutionId,
    reason,
    mergedSha: rec.headSha,
    status: 'reverting',
  });

  await recordAudit({
        action: 'EVOLUTION_ROLLBACK_PERFORMED',
    actorId: 'evolution-engine',
    actorType: 'system',
    targetId: evolutionId,
    targetType: 'evolution',
    description: `Rollback initiated for ${evolutionId}: ${reason}`,
    severity: 'error',
    metadata: { rollbackId: rollback.id, mergedSha: rec.headSha },
  });

  try {
    const revertSha = await revertMergeCommit(rec.headSha, rec.sourceBranch);
    await updateRollback(rollback.id, {
      status: 'succeeded',
      revertSha,
      endedAt: new Date().toISOString(),
      outputTail: `revert ${revertSha}`,
    });
    log.info('rollback succeeded', { evolutionId, revertSha });
  } catch (err) {
    await updateRollback(rollback.id, {
      status: 'failed',
      endedAt: new Date().toISOString(),
      outputTail: String(err).slice(-4096),
    });
    log.error('rollback failed', { evolutionId, error: String(err) });
    throw err;
  }
}

// ----- Reap crashed runs (call on app startup or via cron) -----

export async function recoverCrashedRuns(): Promise<string[]> {
  const reaped = await reapCrashedRuns();
  for (const id of reaped) {
    await setEvolutionStatus(id, 'failed', {
      lastError: 'crashed (lock expired without heartbeat)',
    });
    await recordAudit({
            action: 'EVOLUTION_CRASH_RECOVERED',
      actorId: 'evolution-engine',
      actorType: 'system',
      targetId: id,
      targetType: 'evolution',
      description: `Recovered crashed evolution ${id}`,
      severity: 'error',
    });
  }
  return reaped;
}

// ----- Helpers -----

function buildPRBody(
  evolutionId: string,
  plan: ImprovementPlan,
  evaluation: EvaluationResult,
  diffStat: string
): string {
  const lines: string[] = [
    `## Gen3ia Evolution — Auto-generated PR`,
    '',
    `**Evolution ID:** \`${evolutionId}\``,
    `**Plan ID:** \`${plan.id}\``,
    `**Generated by:** \`${plan.generatedByModel}\``,
    `**Safety level:** L${plan.proposals[0]?.requiredSafetyLevel ?? 1}`,
    '',
    `### Summary`,
    plan.summary,
    '',
    `### Proposals`,
    ...plan.proposals.map(
      (p, i) =>
        `${i + 1}. **${p.title}** (confidence ${p.confidence.toFixed(2)}, est. cost $${p.estimatedCostUsd.toFixed(2)})\n   ${p.summary}`
    ),
    '',
    `### Risks`,
    ...plan.globalRisks.map((r) => `- ${r}`),
    '',
    `### Evaluation verdict`,
    evaluation.verdict,
    `**Recommendation:** ${evaluation.recommendation} (confidence ${evaluation.confidence.toFixed(2)})`,
    '',
    `### Metrics delta`,
    '| metric | before | after | delta |',
    '|---|---|---|---|',
    ...evaluation.deltas.map(
      (d) => `| ${d.name} | ${d.before ?? 'n/a'} | ${d.after ?? 'n/a'} | ${d.delta ?? 'n/a'} |`
    ),
    '',
    `### Diff stat`,
    '```',
    diffStat,
    '```',
    '',
    `### Verification steps`,
    ...plan.verificationSteps.map((s) => `- [ ] ${s}`),
    '',
    '---',
    '_This PR was generated by the Gen3ia Evolution Engine. All changes have passed the safety gate (L1/L2). Rollback is automatic if post-merge monitoring detects a regression._',
  ];
  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Re-export for the public API
export type { EvolutionPhase, ImprovementPlan, ObservationSnapshot, RootCause };
