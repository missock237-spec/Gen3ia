import { db } from "@/lib/db"
import { BaseEngine, type EngineContext, type EngineExecution } from "./sdk"
import { executePlan, type ExecutorCallbacks, type ExecutorContext } from "./executor"
import { evaluatePlans, type EvaluationWeights } from "./evaluator"
import type { ExplorationResult, Plan, PlanId, PriorityProfile, DeviationReport } from "./types"
import { chat } from "@/lib/ai"
import { logger } from "@/lib/observability/logger"

/**
 * ParallelExplorer — Mode exploration : génère et exécute plusieurs
 * variantes d'un plan en parallèle, compare les résultats, garde le meilleur.
 */
export class ParallelExplorer {
  /**
   * Exécute plusieurs variantes de plans en parallèle et sélectionne le meilleur.
   * @param plans Les plans candidats (généralement les 5 plans A-E)
   * @param maxVariants Nombre max de variantes à exécuter en parallèle (défaut 3)
   */
  async explore(
    plans: Plan[],
    executorCtx: ExecutorContext,
    callbacks: ExecutorCallbacks,
    weights: EvaluationWeights,
    maxVariants = 3
  ): Promise<ExplorationResult> {
    const variants = plans.slice(0, maxVariants)
    logger.info(`Exploration parallèle : ${variants.length} variantes en parallèle`)

    // Exécution parallèle de toutes les variantes
    const results = await Promise.all(
      variants.map(async (plan) => {
        const start = Date.now()
        try {
          const outcome = await executePlan(plan, executorCtx, callbacks)
          const latencyMs = Date.now() - start

          // Évaluer le résultat
          const scores = await evaluatePlans([plan], weights)
          const score = scores[0]?.weighted ?? 0

          return {
            planId: plan.id,
            result: outcome.result ?? "",
            score,
            cost: plan.estimatedCostCredits,
            latencyMs,
          }
        } catch (err) {
          return {
            planId: plan.id,
            result: "",
            score: 0,
            cost: plan.estimatedCostCredits,
            latencyMs: Date.now() - start,
          }
        }
      })
    )

    // Sélectionner le meilleur résultat
    const winner = results.reduce((best, r) => (r.score > best.score ? r : best), results[0])

    return {
      variants: results,
      winnerPlanId: winner.planId,
      winnerResult: winner.result,
    }
  }
}

/**
 * ExplorationEngine — Adaptateur BaseEngine pour le mode exploration.
 */
export class ExplorationEngine extends BaseEngine<{ plans: Plan[]; maxVariants?: number }, ExplorationResult> {
  readonly name = "EXPLORATION" as const
  readonly description = "Exécution parallèle de variantes et sélection du meilleur résultat."
  readonly phase = "EXECUTING" as const
  readonly errorCode = "EXECUTION_FAILED" as const

  async execute(
    input: { plans: Plan[]; maxVariants?: number },
    ctx: EngineContext
  ): Promise<EngineExecution<ExplorationResult>> {
    const explorer = new ParallelExplorer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await explorer.explore(input.plans, {} as any, {} as any, {} as any, input.maxVariants ?? 3)
    return { value: result, tokensIn: 0, tokensOut: 0, durationMs: 0, attempts: 1 }
  }

  async rollback(ctx: EngineContext): Promise<void> {
    await db.explorationRun.updateMany({
      where: { taskId: ctx.taskId },
      data: { status: "FAILED" },
    }).catch(() => undefined)
  }
}
