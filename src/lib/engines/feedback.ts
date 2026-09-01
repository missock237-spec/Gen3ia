import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

/**
 * Feedback Engine (amélioration « Rendre le Learning Engine Actionnable »).
 *
 * La mémoire 5 couches conserve les leçons ; ce module les transforme en
 * DÉCISIONS mesurables pour les moteurs suivants :
 *
 *  1. Prior de succès par archeype de plan (A-E) — l'évaluateur module la
 *     probabilité de succès déclarée du LLM par le taux de réussite OBSERVÉ
 *     de cet utilisateur (lissage de Laplace, α=β=2 → démarre à 0.5).
 *  2. Fiabilité des outils — agrégée depuis les télémétries EngineRun du
 *     exécuteur (détail JSON { tools: [...] }) : les plans utilisant un
 *     outil historiquement défaillant sont pénalisés, et le planificateur
 *     reçoit la liste des outils à éviter.
 *  3. Leçons sémantiquement proches — le rappel mémoire utilise la
 *     similarité vectorielle (leçons indexées à l'écriture).
 *
 * Toutes les statistiques sont bornées dans le temps (fenêtre 30 jours)
 * et nécessitent un échantillon minimal (≥ 3 exécutions) avant d'influencer
 * une décision — pas de sur-apprentissage sur 1 tâche.
 */

export interface StrategyFeedback {
  planId: "A" | "B" | "C" | "D" | "E"
  runs: number
  successRate: number
}

export interface ToolFeedback {
  tool: string
  runs: number
  failures: number
  successRate: number
}

export interface FeedbackSnapshot {
  strategies: StrategyFeedback[]
  tools: ToolFeedback[]
  /** Outils à éviter dans la génération de plans (taux d'échec ≥ 50 %, ≥ 3 exécutions). */
  toolsToAvoid: string[]
  /** Archétypes performants (taux ≥ 70 %, ≥ 3 exécutions). */
  performingStrategies: string[]
}

const WINDOW_DAYS = 30
const MIN_SAMPLE = 3
const LAPLACE_ALPHA = 2 // succès a priori
const LAPLACE_BETA = 2 // échecs a priori

/** Statistiques de succès par archeype de plan sélectionné (A-E). */
export async function strategyFeedback(userId: string): Promise<StrategyFeedback[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
  const groups = await db.task.groupBy({
    by: ["selectedPlanId", "status"],
    where: {
      userId,
      createdAt: { gte: since },
      selectedPlanId: { not: null },
      status: { in: ["COMPLETED", "FAILED"] },
    },
    _count: { _all: true },
  })

  const byPlan = new Map<string, { runs: number; success: number }>()
  for (const g of groups) {
    const planId = g.selectedPlanId ?? "?"
    const entry = byPlan.get(planId) ?? { runs: 0, success: 0 }
    entry.runs += g._count._all
    if (g.status === "COMPLETED") entry.success += g._count._all
    byPlan.set(planId, entry)
  }

  return [...byPlan.entries()].map(([planId, e]) => ({
    planId: planId as StrategyFeedback["planId"],
    runs: e.runs,
    // Lissage de Laplace : (succès + α) / (runs + α + β).
    successRate: Math.round(((e.success + LAPLACE_ALPHA) / (e.runs + LAPLACE_ALPHA + LAPLACE_BETA)) * 1000) / 1000,
  }))
}

/** Fiabilité des outils — depuis la télémétrie EngineRun de l'exécuteur. */
export async function toolFeedback(userId: string): Promise<ToolFeedback[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
  const runs = await db.engineRun.findMany({
    where: { userId, engine: "EXECUTOR", createdAt: { gte: since }, detail: { not: null } },
    select: { ok: true, detail: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  const byTool = new Map<string, { runs: number; failures: number }>()
  for (const run of runs) {
    let tools: string[] = []
    try {
      const detail = JSON.parse(run.detail ?? "{}") as { tools?: string[]; toolFailures?: string[] }
      tools = detail.tools ?? []
      const failures = detail.toolFailures ?? []
      for (const tool of tools) {
        const entry = byTool.get(tool) ?? { runs: 0, failures: 0 }
        entry.runs++
        byTool.set(tool, entry)
      }
      for (const tool of failures) {
        const entry = byTool.get(tool) ?? { runs: 0, failures: 0 }
        entry.failures++
        if (!tools.includes(tool)) entry.runs++
        byTool.set(tool, entry)
      }
    } catch {
      continue
    }
  }

  return [...byTool.entries()].map(([tool, e]) => ({
    tool,
    runs: e.runs,
    failures: e.failures,
    successRate: e.runs > 0 ? Math.round(((e.runs - e.failures) / e.runs) * 1000) / 1000 : 1,
  }))
}

/** Snapshot complet — consommé par l'évaluateur et le planificateur. */
export async function feedbackSnapshot(userId: string): Promise<FeedbackSnapshot> {
  try {
    const [strategies, tools] = await Promise.all([strategyFeedback(userId), toolFeedback(userId)])
    return {
      strategies,
      tools,
      toolsToAvoid: tools
        .filter((t) => t.runs >= MIN_SAMPLE && t.successRate < 0.5)
        .map((t) => t.tool),
      performingStrategies: strategies
        .filter((s) => s.runs >= MIN_SAMPLE && s.successRate >= 0.7)
        .map((s) => s.planId),
    }
  } catch (err) {
    logger.warn("feedback: snapshot indisponible (défaut neutre)", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { strategies: [], tools: [], toolsToAvoid: [], performingStrategies: [] }
  }
}

/**
 * Prior de succès ajusté pour un plan (l'évaluateur remplace la probabilité
 * déclarée par un mélange déclaratif/observé : 0.7·p_LLM + 0.3·p_observé).
 * Sans historique suffisant (< MIN_SAMPLE), retourne la probabilité déclarée.
 */
export function blendedSuccessProbability(
  declared: number,
  feedback: FeedbackSnapshot,
  planId: string
): number {
  const stat = feedback.strategies.find((s) => s.planId === planId)
  if (!stat || stat.runs < MIN_SAMPLE) return declared
  const blended = 0.7 * declared + 0.3 * stat.successRate
  return Math.min(0.95, Math.max(0.05, Math.round(blended * 1000) / 1000))
}

/** Pénalité de fiabilité d'outil : multiplicateur [0.5, 1] sur le critère de succès. */
export function toolReliabilityMultiplier(
  requiredTools: string[],
  feedback: FeedbackSnapshot
): number {
  if (requiredTools.length === 0 || feedback.tools.length === 0) return 1
  let multiplier = 1
  for (const tool of requiredTools) {
    const stat = feedback.tools.find((t) => t.tool === tool)
    if (stat && stat.runs >= MIN_SAMPLE) {
      // Outil défaillant → plan pénalisé (au pire ×0.5).
      multiplier = Math.min(multiplier, 0.5 + 0.5 * stat.successRate)
    }
  }
  return multiplier
}

/** Bloc de contexte injecté au prompt du planificateur. */
export function plannerFeedbackBlock(feedback: FeedbackSnapshot): string {
  const lines: string[] = []
  if (feedback.toolsToAvoid.length > 0) {
    lines.push(
      `OUTILS HISTORIQUEMENT DÉFAILLANTS pour cet utilisateur (évite-les sauf nécessité absolue) : ${feedback.toolsToAvoid.join(", ")}.`
    )
  }
  if (feedback.performingStrategies.length > 0) {
    lines.push(
      `ARCHÉTYPES DE PLANS HISTORIQUEMENT RÉUSSIS pour cet utilisateur : ${feedback.performingStrategies.join(", ")} — privilégie des approches similaires quand c'est pertinent.`
    )
  }
  return lines.join("\n")
}
