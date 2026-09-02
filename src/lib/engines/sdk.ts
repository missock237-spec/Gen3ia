import type { ErrorCode } from "@/lib/errors"
import { EngineError } from "@/lib/errors"
import type { PipelinePhase } from "./state-machine"
import { bumpEngineRun, recordEngineRun, aggregateEngineStats, type EngineStats } from "@/lib/observability/metrics"
import type { Logger } from "@/lib/observability/logger"
import { logger as rootLogger } from "@/lib/observability/logger"

/**
 * SDK de moteurs (amélioration « Définir un SDK de Moteurs Clair »).
 *
 * Contrat strict imposé à CHAQUE moteur du pipeline :
 *
 *   interface EngineInterface<I, O> {
 *     execute(input, ctx)  — exécute la phase, retourne une EngineExecution
 *                            (valeur + tokens + durée + tentatives) ;
 *     rollback(ctx, err?)  — annule proprement les effets persistés de la
 *                            phase (ex: invalider plans/planScores) ;
 *     getStatus()          — santé et performances agrégées du moteur.
 *   }
 *
 * Avantages :
 *  - testabilité : chaque moteur est isolable et moquable via le contrat ;
 *  - observabilité uniforme : runEngine() mesure durée/succès/tokens de
 *    chaque moteur (EngineRun) sans duplication de code ;
 *  - extensibilité : ajouter un moteur (ex: EthicsEngine, déjà fourni)
 *    = implémenter l'interface + l'enregistrer au registre ;
 *  - rollback déterministe par phase en cas d'échec/replan.
 *
 * Exécutez TOUJOURS les moteurs via runEngine() : c'est lui qui applique
 * la télémétrie, la journalisation structurée et le mapping d'erreurs.
 */

export type EngineName =
  | "PROMPT_ANALYSIS"
  | "PLANNER"
  | "EVALUATOR"
  | "ETHICS"
  | "EXECUTOR"
  | "VERIFICATION"
  | "SELF_CORRECTION"
  | "LEARNING"
  | "ORCHESTRATOR"
  | "SWARM"
  | "DEBATE"
  | "EXPLORATION"
  | "ANOMALY_DETECTOR"
  | "BATCH"

export interface EngineContext {
  taskId: string
  userId: string
  agentId: string | null
  /** Réglages utilisateur fusionnés avec les défauts. */
  settings: {
    maxAttempts: number
    confirmDangerousOps: boolean
    planApproval: "auto" | "manual"
  }
  allowedTools: string[]
  memories: string[]
  knowledgeContext: string
  logger: Logger
  /** Budget global de retries partagé entre les phases (persisté sur Task.totalRetries). */
  retryBudget?: {
    spent: number
    max: number
    onSpend?: (totalSpent: number) => Promise<void> | void
  }
}

export interface EngineExecution<O> {
  value: O
  tokensIn: number
  tokensOut: number
  durationMs: number
  attempts: number
  /** Marqueurs optionnels (ex: cache de plans touché). */
  meta?: Record<string, unknown>
}

export interface EngineHealth {
  name: string
  description: string
  phase: PipelinePhase | null
  /** Statistiques durables (7 jours) — null si aucune exécution. */
  stats: EngineStats | null
}

export interface EngineInterface<I = unknown, O = unknown> {
  readonly name: EngineName
  readonly description: string
  /** Phase du pipeline pilotée par ce moteur (null = moteur transversal). */
  readonly phase: PipelinePhase | null
  /** Code métier levé en cas d'échec du moteur. */
  readonly errorCode: ErrorCode
  execute(input: I, ctx: EngineContext): Promise<EngineExecution<O>>
  rollback?(ctx: EngineContext, err?: unknown): Promise<void>
  getStatus(): Promise<EngineHealth>
}

/** Base commune : implémente getStatus() depuis la télémétrie. */
export abstract class BaseEngine<I = unknown, O = unknown> implements EngineInterface<I, O> {
  abstract readonly name: EngineName
  abstract readonly description: string
  abstract readonly phase: PipelinePhase | null
  abstract readonly errorCode: ErrorCode

  abstract execute(input: I, ctx: EngineContext): Promise<EngineExecution<O>>

  async getStatus(): Promise<EngineHealth> {
    const stats = await aggregateEngineStats(7)
    return {
      name: this.name,
      description: this.description,
      phase: this.phase,
      stats: stats.find((s) => s.engine === this.name) ?? null,
    }
  }
}

/**
 * Exécute un moteur avec télémétrie, journalisation et mapping d'erreurs.
 * Toute exception non-AppError est convertie en EngineError(code du moteur).
 */
export async function runEngine<I, O>(
  engine: EngineInterface<I, O>,
  input: I,
  ctx: EngineContext
): Promise<EngineExecution<O>> {
  const started = Date.now()
  const log = ctx.logger.child({ engine: engine.name, taskId: ctx.taskId, phase: engine.phase })
  try {
    const execution = await engine.execute(input, ctx)
    const durationMs = Date.now() - started
    bumpEngineRun(engine.name, true, durationMs)
    await recordEngineRun({
      engine: engine.name,
      taskId: ctx.taskId,
      userId: ctx.userId,
      phase: engine.phase ?? null,
      ok: true,
      durationMs,
      attempts: execution.attempts,
      tokensIn: execution.tokensIn,
      tokensOut: execution.tokensOut,
    })
    log.info("moteur exécuté", {
      ok: true,
      durMs: durationMs,
      tokensIn: execution.tokensIn,
      tokensOut: execution.tokensOut,
      ...execution.meta,
    })
    return { ...execution, durationMs }
  } catch (err) {
    const durationMs = Date.now() - started
    const appErr =
      err instanceof EngineError || (err as { code?: string }).code
        ? err
        : new EngineError(engine.errorCode, err instanceof Error ? err.message : String(err), { cause: err })
    bumpEngineRun(engine.name, false, durationMs)
    await recordEngineRun({
      engine: engine.name,
      taskId: ctx.taskId,
      userId: ctx.userId,
      phase: engine.phase ?? null,
      ok: false,
      errorCode: (appErr as { code: string }).code ?? engine.errorCode,
      durationMs,
      detail: { error: err instanceof Error ? err.message : String(err) },
    })
    log.error("échec du moteur", {
      ok: false,
      durMs: durationMs,
      code: (appErr as { code: string }).code,
    })
    throw appErr
  }
}

// ---------- Registre ----------

const registry = new Map<EngineName, EngineInterface<never, never>>()

export function registerEngine(engine: EngineInterface<any, any>): void {
  registry.set(engine.name, engine as EngineInterface<never, never>)
}

export function getEngine(name: EngineName): EngineInterface<any, any> | undefined {
  return registry.get(name)
}

export async function listEngineHealth(): Promise<EngineHealth[]> {
  return Promise.all([...registry.values()].map((e) => e.getStatus()))
}
