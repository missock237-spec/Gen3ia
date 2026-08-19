// ============================================================
// Gen3ia Evolution Engine — Memory (persistence layer)
// ============================================================
// Thin wrapper around the Firestore-backed `db.evolution*` repos.
// All reads/writes go through this module so we centralise
// serialization, id generation, and error handling.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import type {
  EvolutionRecord,
  EvolutionPhase,
  EvolutionStatus,
  ImprovementPlan,
  ObservationSnapshot,
  RootCause,
  EvaluationResult,
  RollbackRecord,
  SelfImprovementRecord,
  MetaEvaluation,
  ValidationResult,
  StepStatus,
} from './types';

const log = createLogger('evolution-memory');

// ----- ID generation -----

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}${rand}`;
}

// ----- Evolution record -----

export async function createEvolutionRecord(
  input: Omit<EvolutionRecord, 'id' | 'startedAt' | 'status' | 'phase' | 'costUsd' | 'totalTokens' | 'totalDurationMs' | 'retryCount' | 'rootCauseIds'> &
    Partial<Pick<EvolutionRecord, 'status' | 'phase' | 'rootCauseIds'>>
): Promise<EvolutionRecord> {
  const record: EvolutionRecord = {
    id: generateId('evo'),
    startedAt: new Date().toISOString(),
    status: input.status ?? 'pending',
    phase: input.phase ?? 'observation',
    costUsd: 0,
    totalTokens: 0,
    totalDurationMs: 0,
    retryCount: 0,
    rootCauseIds: input.rootCauseIds ?? [],
    ...input,
  };
  try {
    await db.evolution.create({ data: record as unknown as Record<string, unknown> });
  } catch (err) {
    log.error('createEvolutionRecord failed', { error: String(err), id: record.id });
    throw err;
  }
  return record;
}

export async function getEvolutionRecord(id: string): Promise<EvolutionRecord | null> {
  try {
    const r = await db.evolution.findUnique({ where: { id } });
    if (!r) return null;
    return r as unknown as EvolutionRecord;
  } catch (err) {
    log.error('getEvolutionRecord failed', { error: String(err), id });
    return null;
  }
}

export async function listEvolutionRecords(opts: {
  limit?: number;
  status?: EvolutionStatus;
  triggeredBy?: string;
  orderBy?: 'startedAt' | 'costUsd' | 'totalDurationMs';
  orderDir?: 'asc' | 'desc';
} = {}): Promise<EvolutionRecord[]> {
  try {
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;
    if (opts.triggeredBy) where.triggeredBy = opts.triggeredBy;
    const r = await db.evolution.findMany({
      where,
      orderBy: { [opts.orderBy ?? 'startedAt']: opts.orderDir ?? 'desc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const items = (r ?? []) as unknown as EvolutionRecord[];
    const limit = opts.limit ?? 50;
    return items.slice(0, limit);
  } catch (err) {
    log.error('listEvolutionRecords failed', { error: String(err) });
    return [];
  }
}

export async function updateEvolutionRecord(
  id: string,
  patch: Partial<EvolutionRecord>
): Promise<EvolutionRecord | null> {
  try {
    const r = await db.evolution.update({
      where: { id },
      data: patch as unknown as Record<string, unknown>,
    });
    return r as unknown as EvolutionRecord;
  } catch (err) {
    log.error('updateEvolutionRecord failed', { error: String(err), id, patch: JSON.stringify(patch).slice(0, 200) });
    return null;
  }
}

export async function setEvolutionPhase(id: string, phase: EvolutionPhase): Promise<void> {
  await updateEvolutionRecord(id, { phase, status: 'running' });
}

export async function setEvolutionStatus(
  id: string,
  status: EvolutionStatus,
  extra?: Partial<EvolutionRecord>
): Promise<void> {
  await updateEvolutionRecord(id, { status, ...extra, endedAt: ['failed', 'rolled_back', 'deployed', 'cancelled', 'skipped', 'pr_merged'].includes(status) ? new Date().toISOString() : undefined, ...(extra ?? {}) });
}

export async function appendCost(
  id: string,
  costUsd: number,
  tokens: number,
  durationMs: number
): Promise<void> {
  try {
    const rec = await getEvolutionRecord(id);
    if (!rec) return;
    await updateEvolutionRecord(id, {
      costUsd: (rec.costUsd ?? 0) + costUsd,
      totalTokens: (rec.totalTokens ?? 0) + tokens,
      totalDurationMs: (rec.totalDurationMs ?? 0) + durationMs,
    });
  } catch (err) {
    log.error('appendCost failed', { error: String(err), id });
  }
}

// ----- Steps -----

export interface EvolutionStepRecord {
  id: string;
  evolutionId: string;
  phase: EvolutionPhase;
  status: StepStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outputTail?: string;
  error?: string;
  retryAttempt?: number;
}

export async function createStep(
  evolutionId: string,
  phase: EvolutionPhase,
  retryAttempt = 0
): Promise<EvolutionStepRecord> {
  const step: EvolutionStepRecord = {
    id: generateId('step'),
    evolutionId,
    phase,
    status: 'running',
    startedAt: new Date().toISOString(),
    retryAttempt,
  };
  try {
    await db.evolutionStep.create({ data: step as unknown as Record<string, unknown> });
  } catch (err) {
    log.error('createStep failed', { error: String(err) });
  }
  return step;
}

export async function updateStep(
  stepId: string,
  patch: Partial<EvolutionStepRecord>
): Promise<void> {
  try {
    await db.evolutionStep.update({
      where: { id: stepId },
      data: patch as unknown as Record<string, unknown>,
    });
  } catch (err) {
    log.error('updateStep failed', { error: String(err), stepId });
  }
}

export async function completeStep(
  stepId: string,
  status: StepStatus,
  extra?: Partial<EvolutionStepRecord>
): Promise<void> {
  const endedAt = new Date().toISOString();
  await updateStep(stepId, { status, endedAt, ...extra });
}

export async function listSteps(evolutionId: string): Promise<EvolutionStepRecord[]> {
  try {
    const r = await db.evolutionStep.findMany({
      where: { evolutionId },
      orderBy: { startedAt: 'asc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return (r ?? []) as unknown as EvolutionStepRecord[];
  } catch (err) {
    log.error('listSteps failed', { error: String(err), evolutionId });
    return [];
  }
}

// ----- Plan -----

export async function savePlan(plan: ImprovementPlan): Promise<void> {
  try {
    await db.evolutionPlan.create({ data: plan as unknown as Record<string, unknown> });
    await updateEvolutionRecord(plan.evolutionId, { planId: plan.id });
  } catch (err) {
    log.error('savePlan failed', { error: String(err), planId: plan.id });
  }
}

export async function getPlan(planId: string): Promise<ImprovementPlan | null> {
  try {
    const r = await db.evolutionPlan.findUnique({ where: { id: planId } });
    return r as unknown as ImprovementPlan | null;
  } catch (err) {
    log.error('getPlan failed', { error: String(err), planId });
    return null;
  }
}

// ----- Snapshot -----

export async function saveSnapshot(snap: ObservationSnapshot): Promise<void> {
  try {
    await db.evolutionMetric.create({ data: snap as unknown as Record<string, unknown> });
    await updateEvolutionRecord(snap.evolutionId, { snapshotId: snap.id });
  } catch (err) {
    log.error('saveSnapshot failed', { error: String(err), snapId: snap.id });
  }
}

// ----- Root cause -----

export async function saveRootCause(rc: RootCause): Promise<void> {
  try {
    await db.evolutionMetric.create({
      data: { kind: 'root_cause', ...rc } as unknown as Record<string, unknown>,
    });
  } catch (err) {
    log.error('saveRootCause failed', { error: String(err), rcId: rc.id });
  }
}

// ----- Evaluation -----

export async function saveEvaluation(evalResult: EvaluationResult & { id: string; evolutionId: string }): Promise<void> {
  try {
    await db.evolutionResult.create({ data: evalResult as unknown as Record<string, unknown> });
    await updateEvolutionRecord(evalResult.evolutionId, { evaluationId: evalResult.id });
  } catch (err) {
    log.error('saveEvaluation failed', { error: String(err) });
  }
}

// ----- Rollback -----

export async function createRollback(input: Omit<RollbackRecord, 'id' | 'startedAt' | 'status'> & { status?: RollbackRecord['status'] }): Promise<RollbackRecord> {
  const rec: RollbackRecord = {
    id: generateId('rb'),
    startedAt: new Date().toISOString(),
    status: 'pending',
    ...input,
  };
  if (input.status) rec.status = input.status;
  try {
    await db.evolutionRollback.create({ data: rec as unknown as Record<string, unknown> });
    await updateEvolutionRecord(input.evolutionId, { rollbackId: rec.id, status: 'rolled_back' });
  } catch (err) {
    log.error('createRollback failed', { error: String(err) });
  }
  return rec;
}

export async function updateRollback(id: string, patch: Partial<RollbackRecord>): Promise<void> {
  try {
    await db.evolutionRollback.update({
      where: { id },
      data: patch as unknown as Record<string, unknown>,
    });
  } catch (err) {
    log.error('updateRollback failed', { error: String(err), id });
  }
}

export async function getRollback(id: string): Promise<RollbackRecord | null> {
  try {
    const r = await db.evolutionRollback.findUnique({ where: { id } });
    return r as unknown as RollbackRecord | null;
  } catch {
    return null;
  }
}

// ----- Validation results -----

export async function saveValidationResult(
  evolutionId: string,
  result: ValidationResult
): Promise<void> {
  try {
    await db.evolutionLog.create({
      data: {
        kind: 'validation',
        evolutionId,
        ...result,
      } as unknown as Record<string, unknown>,
    });
  } catch (err) {
    log.error('saveValidationResult failed', { error: String(err) });
  }
}

// ----- Self-improvement & meta-evaluation -----

export async function saveSelfImprovement(rec: SelfImprovementRecord): Promise<void> {
  try {
    await db.selfImprovement.create({ data: rec as unknown as Record<string, unknown> });
  } catch (err) {
    log.error('saveSelfImprovement failed', { error: String(err) });
  }
}

export async function saveMetaEvaluation(rec: MetaEvaluation): Promise<void> {
  try {
    await db.metaEvaluation.create({ data: rec as unknown as Record<string, unknown> });
  } catch (err) {
    log.error('saveMetaEvaluation failed', { error: String(err) });
  }
}

export async function listSelfImprovements(limit = 50): Promise<SelfImprovementRecord[]> {
  try {
    const r = await db.selfImprovement.findMany({
      orderBy: { appliedAt: 'desc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return ((r ?? []) as unknown as SelfImprovementRecord[]).slice(0, limit);
  } catch (err) {
    log.error('listSelfImprovements failed', { error: String(err) });
    return [];
  }
}
