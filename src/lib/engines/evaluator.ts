import type {
  EvaluationWeights,
  Plan,
  PlanScore,
} from "./types"
import { DEFAULT_WEIGHTS } from "./types"

/**
 * Plan Evaluation Engine — note chaque plan selon une formule configurable,
 * puis sélectionne le meilleur plan. La formule combine :
 *
 *   score = w1·successRate + w2·accuracy + w3·(1-coût normalisé)
 *         + w4·(1-latence normalisée) + w5·(1-risque) + w6·complétude
 *
 * Les poids sont ajustables par l'utilisateur (page Paramètres) et stockés
 * dans ses préférences. La décision est entièrement traçable : le détail
 * de chaque critère est conservé avec la tâche.
 */

interface EvaluationInput {
  plans: Plan[]
  weights?: Partial<EvaluationWeights>
  availableTools: string[]
  userCredits: number
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Coût normalisé (0 = gratuit, 1 = le plus cher de la série). */
function normalizedCost(plan: Plan, maxCost: number): number {
  if (maxCost <= 0) return 0
  return clamp01(plan.estimatedCostCredits / maxCost)
}

/** Latence proxy : nombre d'étapes (0 = 1 étape, 1 = le max). */
function normalizedLatency(plan: Plan, maxSteps: number): number {
  if (maxSteps <= 1) return 0
  return clamp01((plan.steps.length - 1) / (maxSteps - 1))
}

/** Complétude : couverture des objectifs et disponibilité réelle des outils requis. */
function completeness(plan: Plan, goalsCount: number, availableTools: string[]): number {
  const toolCoverage =
    plan.requiredTools.length === 0
      ? 1
      : plan.requiredTools.filter((t) => availableTools.includes(t)).length /
        plan.requiredTools.length
  // Couverture heuristique : nombre d'étapes par rapport aux objectifs.
  const goalCoverage = clamp01(plan.steps.length / Math.max(1, goalsCount))
  return clamp01(0.6 * toolCoverage + 0.4 * goalCoverage)
}

export function evaluatePlans(input: EvaluationInput): {
  scores: PlanScore[]
  selectedPlanId: Plan["id"]
  rationale: string
} {
  const weights: EvaluationWeights = { ...DEFAULT_WEIGHTS, ...input.weights }
  const maxCost = Math.max(...input.plans.map((p) => p.estimatedCostCredits), 0.01)
  const maxSteps = Math.max(...input.plans.map((p) => p.steps.length), 1)
  const goalsCount = input.plans.length // approximation : la complétude relative suffit

  const scores: PlanScore[] = input.plans.map((plan) => {
    const entries = [
      {
        criterion: "successRate",
        value: clamp01(plan.successProbability),
        weight: weights.successRate,
      },
      {
        criterion: "accuracy",
        // précision proxy : probabilité × (1 - risques normalisés)
        value: clamp01(
          plan.successProbability * (1 - clamp01(plan.risks.length / 5))
        ),
        weight: weights.accuracy,
      },
      {
        criterion: "cost",
        value: 1 - normalizedCost(plan, maxCost),
        weight: weights.cost,
      },
      {
        criterion: "latency",
        value: 1 - normalizedLatency(plan, maxSteps),
        weight: weights.latency,
      },
      {
        criterion: "risk",
        value: 1 - clamp01(plan.risks.length / 5),
        weight: weights.risk,
      },
      {
        criterion: "completeness",
        value: completeness(plan, goalsCount, input.availableTools),
        weight: weights.completeness,
      },
    ].map((e) => ({
      criterion: e.criterion,
      value: Math.round(e.value * 1000) / 1000,
      weight: e.weight,
      contribution: Math.round(e.value * e.weight * 1000) / 1000,
    }))

    const weighted = entries.reduce((acc, e) => acc + e.contribution, 0)
    return { planId: plan.id, weighted: Math.round(weighted * 1000) / 1000, breakdown: entries }
  })

  // Filtre d'élagage : un plan dont un outil requis est indisponible est pénalisé
  // fortement (déjà reflété par la complétude), et un plan trop cher pour le
  // solde de crédits de l'utilisateur est disqualifié.
  const eligible = input.plans.filter((p) => p.estimatedCostCredits <= input.userCredits)
  const pool = eligible.length > 0 ? eligible : input.plans

  const best = pool.reduce((acc, plan) => {
    const s = scores.find((sc) => sc.planId === plan.id)!
    const accS = scores.find((sc) => sc.planId === acc.id)!
    return s.weighted > accS.weighted ? plan : acc
  }, pool[0])

  const bestScore = scores.find((s) => s.planId === best.id)!
  const rationale =
    `Plan ${best.id} (« ${best.name} ») retenu avec un score pondéré de ` +
    `${(bestScore.weighted * 100).toFixed(1)}% — probabilité de succès déclarée ` +
    `${(best.successProbability * 100).toFixed(0)}%, coût estimé ${best.estimatedCostCredits.toFixed(1)} crédits, ` +
    `${best.steps.length} étapes.` +
    (eligible.length === 0
      ? " Attention : tous les plans dépassent le solde de crédits disponible."
      : "")

  return { scores, selectedPlanId: best.id, rationale }
}
