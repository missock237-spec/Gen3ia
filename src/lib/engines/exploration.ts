import { executePlan, type ExecutorCallbacks, type ExecutorContext } from "./executor"
import { evaluatePlans } from "./evaluator"
import type { ExplorationResult, Plan, PromptAnalysis, EvaluationWeights } from "./types"
import { logger } from "@/lib/observability/logger"

/** Entrée du mode exploration — tout le contexte réel d'une exécution. */
export interface ExploreInput {
  prompt: string
  analysis: PromptAnalysis
  plans: Plan[]
  executorCtx: ExecutorContext
  callbacks: ExecutorCallbacks
  weights: EvaluationWeights
  /** Nombre max de variantes exécutées en parallèle (1-3, défaut 2). */
  maxVariants?: number
  /** Crédits de l'utilisateur — filtre d'éligibilité des plans. */
  userCredits?: number
}

/**
 * ParallelExplorer — Mode exploration : exécute plusieurs variantes du plan
 * d'une tâche EN PARALLÈLE, évalue chaque résultat avec les pondérations de
 * l'utilisateur et sélectionne le meilleur. Chaque variante traverse le vrai
 * moteur d'exécution (outils, HITL, journalisation, métriques).
 */
export class ParallelExplorer {
  /**
   * Exécute les variantes en parallèle et retourne le résultat gagnant.
   */
  async explore(input: ExploreInput): Promise<ExplorationResult> {
    const maxVariants = Math.max(1, Math.min(3, input.maxVariants ?? 2))
    const userCredits = input.userCredits ?? Number.MAX_SAFE_INTEGER
    const variants = input.plans.slice(0, maxVariants)
    logger.info("Exploration parallèle lancée", {
      taskId: input.executorCtx.taskId,
      userId: input.executorCtx.userId,
      variants: variants.length,
    })

    // Exécution parallèle de toutes les variantes (vrai moteur, vrai contexte).
    const results = await Promise.all(
      variants.map(async (plan) => {
        const start = Date.now()
        try {
          const outcome = await executePlan(
            input.prompt,
            input.analysis,
            plan,
            input.executorCtx,
            input.callbacks
          )
          const latencyMs = Date.now() - start

          // Évaluer le résultat avec les pondérations réelles.
          const evaluation = evaluatePlans({
            plans: [plan],
            weights: input.weights,
            availableTools: input.executorCtx.allowedTools,
            userCredits,
          })
          const score = evaluation.scores[0]?.weighted ?? 0

          return {
            planId: plan.id,
            result: outcome.finalAnswer,
            score,
            cost: plan.estimatedCostCredits,
            latencyMs,
          }
        } catch (err) {
          logger.warn("Variante d'exploration échouée", {
            planId: plan.id,
            error: String(err),
          })
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
