// ============================================================
// Gen3ia Evolution Engine — Safety gates
// ============================================================
// Enforces the 3-tier safety policy:
//   L1 — Auto-OK (comments, prompts, tests, docs)
//   L2 — Enhanced validation (bug fixes, perf)
//   L3 — Human approval required (auth, DB, infra, secrets)
//
// The orchestrator calls `enforceSafetyGate(plan)` BEFORE applying
// a plan, and `enforcePreMergeGate(plan, evaluation)` BEFORE merging.
// ============================================================

import { createLogger } from '@/lib/logger';
import { recordAudit } from '@/lib/security/audit-trail';
import { getEvolutionRecord, updateEvolutionRecord } from './memory';
import { isProtectedPath } from './config';
import type { ImprovementPlan, EvaluationResult, SafetyLevel } from './types';

const log = createLogger('evolution-safety');

export interface SafetyGateResult {
  ok: boolean;
  level: SafetyLevel;
  reason: string;
  /** When L3 is required and the run is awaiting human approval. */
  awaitingHumanApproval: boolean;
  /** Paths that triggered L3 (for logging / dashboard). */
  triggeringPaths: string[];
}

export async function enforceSafetyGate(
  evolutionId: string,
  plan: ImprovementPlan
): Promise<SafetyGateResult> {
  const triggeringPaths: string[] = [];
  let maxLevel: SafetyLevel = 1;

  for (const proposal of plan.proposals) {
    if (proposal.requiredSafetyLevel > maxLevel) {
      maxLevel = proposal.requiredSafetyLevel;
    }
    for (const fc of proposal.fileChanges) {
      if (isProtectedPath(fc.path)) {
        // PROTECTED — refuse outright, do not even allow L3 auto-apply
        triggeringPaths.push(fc.path);
        log.error('SAFETY: protected path in plan, refusing', { path: fc.path, evolutionId });
        await recordAudit({
          action: 'EVOLUTION_SAFETY_BLOCKED',
          actorId: 'evolution-engine',
          actorType: 'system',
          targetId: evolutionId,
          targetType: 'evolution',
          description: `Refused to apply plan ${plan.id} — protected path ${fc.path} detected`,
          severity: 'error',
          metadata: { planId: plan.id, path: fc.path },
        });
        return {
          ok: false,
          level: 3,
          reason: `Refused: protected path ${fc.path} in plan`,
          awaitingHumanApproval: false,
          triggeringPaths,
        };
      }
    }
  }

  if (maxLevel === 3) {
    // L3: needs human approval. Mark the evolution as awaiting_review.
    await updateEvolutionRecord(evolutionId, { status: 'awaiting_review', safetyLevel: 3 });
    await recordAudit({
      action: 'EVOLUTION_SAFETY_BLOCKED',
      actorId: 'evolution-engine',
      actorType: 'system',
      targetId: evolutionId,
      targetType: 'evolution',
      description: `Plan ${plan.id} requires L3 human approval (max level ${maxLevel})`,
      severity: 'warning',
      metadata: { planId: plan.id, level: maxLevel, triggeringPaths },
    });
    return {
      ok: false,
      level: 3,
      reason: 'L3 human approval required',
      awaitingHumanApproval: true,
      triggeringPaths,
    };
  }

  // L1/L2: auto-approve
  await updateEvolutionRecord(evolutionId, { safetyLevel: maxLevel });
  return {
    ok: true,
    level: maxLevel,
    reason: `L${maxLevel} auto-approved`,
    awaitingHumanApproval: false,
    triggeringPaths,
  };
}

export async function enforcePreMergeGate(
  evolutionId: string,
  evaluation: EvaluationResult
): Promise<{ ok: boolean; reason: string }> {
  if (evaluation.recommendation === 'rollback') {
    await recordAudit({
      action: 'EVOLUTION_SAFETY_BLOCKED',
      actorId: 'evolution-engine',
      actorType: 'system',
      targetId: evolutionId,
      targetType: 'evolution',
      description: `Pre-merge gate blocked merge: evaluation recommended rollback`,
      severity: 'error',
      metadata: { verdict: evaluation.verdict, confidence: evaluation.confidence },
    });
    return { ok: false, reason: 'evaluation recommended rollback' };
  }
  if (evaluation.recommendation === 'hold') {
    log.warn('evaluation recommended hold — blocking merge', { evolutionId });
    return { ok: false, reason: 'evaluation recommended hold' };
  }
  return { ok: true, reason: 'evaluation recommended merge' };
}

// ----- Human approval (L3) -----

export async function grantHumanApproval(
  evolutionId: string,
  approverId: string,
  approverRole: string
): Promise<boolean> {
  if (approverRole !== 'admin') {
    log.warn('human approval denied — not admin', { approverId, approverRole });
    return false;
  }
  const rec = await getEvolutionRecord(evolutionId);
  if (!rec) return false;
  if (rec.status !== 'awaiting_review') {
    log.warn('cannot approve — not in awaiting_review state', { evolutionId, current: rec.status });
    return false;
  }
  await updateEvolutionRecord(evolutionId, { status: 'running' });
  await recordAudit({
    action: 'EVOLUTION_HUMAN_APPROVED',
    actorId: approverId,
    actorType: 'admin',
    targetId: evolutionId,
    targetType: 'evolution',
    description: `Evolution ${evolutionId} approved by admin ${approverId}`,
    severity: 'warning',
  });
  return true;
}
