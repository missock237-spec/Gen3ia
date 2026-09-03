import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { invalidateRegistryCache } from "./model-registry"

/**
 * Model Performance Registry (v4.0 — Phase 7/8).
 *
 * Boucle d'apprentissage du routage :
 *   Execution → Verification → Evaluation → Performance Registry
 *   → agrégation (successRate/quality/latence par modèle)
 *   → Model Router (les scores influencent les sélections futures).
 *
 * Mesure la performance RÉELLE (pas les benchmarks externes) : chaque appel
 * LLM réussi ou échoué alimente la table ModelPerformance, et l'agrégat
 * glissant met à jour AIModel.successRate / qualityScore / avgLatencyMs /
 * sampleCount — lus par le Model Router au prochain routage.
 */

const log = logger.child({ component: "model-performance" })

export interface PerformanceRecord {
  provider: string
  model: string
  taskType: string
  success: boolean
  executionMs: number
  tokensIn?: number
  tokensOut?: number
  costCredits?: number
  errorType?: string
  qualityScore?: number
  evaluatorScore?: number
  contextType?: string
  taskId?: string
  userId?: string
}

/** Fenêtre d'agrégation (jours) — les données anciennes comptent moins. */
export function performanceWindowDays(): number {
  return Math.max(1, Number(process.env.MODEL_PERF_WINDOW_DAYS ?? 30))
}

/**
 * Enregistre une exécution (appelé par la couche IA après CHAQUE appel).
 * Best-effort : jamais bloquant pour l'appel lui-même.
 */
export async function recordPerformance(record: PerformanceRecord): Promise<void> {
  try {
    const modelRow = await resolveModelRow(record.provider, record.model)
    if (!modelRow) return // modèle hors registre (statique) — rien à apprendre
    await db.modelPerformance.create({
      data: {
        modelId: modelRow.id,
        provider: record.provider,
        taskType: record.taskType,
        success: record.success,
        executionMs: Math.round(record.executionMs),
        tokensIn: record.tokensIn ?? 0,
        tokensOut: record.tokensOut ?? 0,
        costCredits: record.costCredits ?? 0,
        errorType: record.errorType?.slice(0, 80) ?? null,
        qualityScore: record.qualityScore ?? null,
        evaluatorScore: record.evaluatorScore ?? null,
        contextType: record.contextType?.slice(0, 60) ?? null,
        taskId: record.taskId ?? null,
      },
    })
    await aggregateModel(modelRow.id)
  } catch (err) {
    log.warn("performance: enregistrement best-effort échoué", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Retrouve la ligne AIModel (créée au besoin pour modèles dynamiques HF). */
async function resolveModelRow(provider: string, model: string): Promise<{ id: string } | null> {
  const existing = await db.aIModel.findFirst({ where: { provider, modelId: model }, select: { id: true } })
  if (existing) return existing
  // Modèle dynamique (résolu depuis HF Hub au routage) : entrée minimale EXPERIMENTAL.
  try {
    const created = await db.aIModel.create({
      data: {
        provider,
        modelId: model,
        name: model.split("/").pop() ?? model,
        modality: "text",
        supportedTasks: JSON.stringify(["EXECUTION", "CHAT"]),
        status: "EXPERIMENTAL",
        priority: 250,
      },
      select: { id: true },
    })
    return created
  } catch {
    return null // course concurrente — l'autre écriture a gagné
  }
}

/**
 * Agrégat glissant pondéré par récence (demi-vie 14 jours) sur la fenêtre.
 * Préserve la priorité de l'historique : au moins 5 échantillons avant
 * d'écraser les valeurs statiques (évite le sur-apprentissage précoce).
 */
export async function aggregateModel(aiModelId: string): Promise<void> {
  const since = new Date(Date.now() - performanceWindowDays() * 86400_000)
  const rows = await db.modelPerformance.findMany({
    where: { modelId: aiModelId, createdAt: { gte: since } },
    select: { success: true, qualityScore: true, executionMs: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  })
  if (rows.length === 0) return

  const HALF_LIFE_DAYS = 14
  const now = Date.now()
  let weightSum = 0
  let successSum = 0
  let qualitySum = 0
  let latencySum = 0

  for (const r of rows) {
    const ageDays = Math.max(0, (now - r.createdAt.getTime()) / 86400_000)
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
    weightSum += weight
    successSum += weight * (r.success ? 1 : 0)
    if (r.qualityScore != null) qualitySum += weight * r.qualityScore
    latencySum += weight * r.executionMs
  }

  const successRate = weightSum > 0 ? successSum / weightSum : 0.8
  const qualityRated = rows.filter((r) => r.qualityScore != null)
  const qualityScore = qualityRated.length > 0
    ? qualitySum / Math.max(1e-9, weightSum * (qualityRated.length / rows.length))
    : 0.5
  const avgLatencyMs = weightSum > 0 ? latencySum / weightSum : 2000

  const current = await db.aIModel.findUnique({
    where: { id: aiModelId },
    select: { successRate: true, qualityScore: true, avgLatencyMs: true, sampleCount: true, status: true },
  })
  if (!current) return

  const totalSamples = current.sampleCount + rows.length
  // Lissage exponentiel : les mesures récentes influencent sans écraser.
  const alpha = Math.min(0.3, rows.length / Math.max(totalSamples, 1))
  const nextSuccess = current.successRate * (1 - alpha) + successRate * alpha
  const nextQuality = current.qualityScore * (1 - alpha) + qualityScore * alpha
  const nextLatency = current.avgLatencyMs * (1 - alpha) + avgLatencyMs * alpha

  await db.aIModel.update({
    where: { id: aiModelId },
    data: {
      successRate: Math.round(nextSuccess * 1000) / 1000,
      qualityScore: Math.round(nextQuality * 1000) / 1000,
      avgLatencyMs: Math.round(nextLatency),
      sampleCount: { increment: rows.length },
      lastEvaluated: new Date(),
      // Promotion automatique : un modèle EXPERIMENTAL avec ≥ 10 succès
      // mesurés et ≥ 0.85 de taux devient ACTIVE (sinon reste observable).
      ...(current.status === "EXPERIMENTAL" && rows.filter((r) => r.success).length >= 10 && nextSuccess >= 0.85
        ? { status: "ACTIVE" }
        : {}),
    },
  })
  invalidateRegistryCache()
}

/**
 * Taux de réussite (model, taskType) — lu par le Model Router.
 * Repli : la moyenne globale du modèle, sinon null (router utilise priorité statique).
 */
export async function taskSuccessRate(
  provider: string,
  model: string,
  taskType: string
): Promise<{ rate: number; samples: number; avgLatencyMs: number; avgQuality: number } | null> {
  try {
    const modelRow = await db.aIModel.findFirst({ where: { provider, modelId: model }, select: { id: true } })
    if (!modelRow) return null
    const since = new Date(Date.now() - performanceWindowDays() * 86400_000)
    const agg = await db.modelPerformance.aggregate({
      where: { modelId: modelRow.id, taskType, createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { executionMs: true, qualityScore: true },
    })
    const total = agg._count._all
    if (total === 0) return null
    const successCount = await db.modelPerformance.count({
      where: { modelId: modelRow.id, taskType, success: true, createdAt: { gte: since } },
    })
    return {
      rate: successCount / total,
      samples: total,
      avgLatencyMs: Math.round(agg._avg.executionMs ?? 2000),
      avgQuality: agg._avg.qualityScore ?? 0.5,
    }
  } catch {
    return null
  }
}

/** Enregistre une décision de routage (traçabilité « pourquoi ce modèle »). */
export async function recordSelection(input: {
  userId?: string | null
  provider: string
  model: string
  taskType: string
  score: number
  confidence: number
  reason: string
  alternatives?: Array<{ provider: string; model: string; score: number; reason: string }>
  costEstimate?: number
  requestId?: string
  taskId?: string
  agentId?: string
}): Promise<void> {
  try {
    const modelRow = await resolveModelRow(input.provider, input.model)
    if (!modelRow) return
    await db.modelSelection.create({
      data: {
        userId: input.userId ?? null,
        modelId: modelRow.id,
        provider: input.provider,
        taskType: input.taskType,
        score: input.score,
        confidence: input.confidence,
        reason: input.reason.slice(0, 500),
        alternatives: input.alternatives ? JSON.stringify(input.alternatives.slice(0, 5)) : null,
        costEstimate: input.costEstimate ?? 0,
        requestId: input.requestId?.slice(0, 100) ?? null,
        taskId: input.taskId ?? null,
        agentId: input.agentId ?? null,
      },
    })
  } catch (err) {
    log.warn("performance: sélection non tracée (best-effort)", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Classement des modèles par catégorie de tâche (dashboard + apprentissage). */
export async function modelRanking(taskType?: string, limit = 20): Promise<
  Array<{
    provider: string
    modelId: string
    name: string
    samples: number
    successRate: number
    avgQuality: number
    avgLatencyMs: number
    totalCost: number
  }>
> {
  const since = new Date(Date.now() - performanceWindowDays() * 86400_000)
  const rows = await db.modelPerformance.findMany({
    where: { taskType, createdAt: { gte: since } },
    select: {
      provider: true, success: true, executionMs: true, qualityScore: true, costCredits: true, modelId: true, model: { select: { modelId: true, name: true } },
    },
    take: 5000,
  })
  const grouped = new Map<string, { provider: string; modelId: string; name: string; samples: number; success: number; quality: number; latency: number; cost: number }>()
  for (const r of rows) {
    const key = `${r.provider}/${r.model?.modelId ?? ""}`
    const g = grouped.get(key) ?? {
      provider: r.provider,
      modelId: r.model?.modelId ?? "?",
      name: r.model?.name ?? r.model?.modelId ?? "?",
      samples: 0, success: 0, quality: 0, latency: 0, cost: 0,
    }
    g.samples++
    if (r.success) g.success++
    g.quality += r.qualityScore ?? 0
    g.latency += r.executionMs
    g.cost += r.costCredits
    grouped.set(key, g)
  }
  return [...grouped.values()]
    .map((g) => ({
      provider: g.provider,
      modelId: g.modelId,
      name: g.name,
      samples: g.samples,
      successRate: g.samples > 0 ? Math.round((g.success / g.samples) * 1000) / 1000 : 0,
      avgQuality: g.samples > 0 ? Math.round((g.quality / g.samples) * 1000) / 1000 : 0,
      avgLatencyMs: g.samples > 0 ? Math.round(g.latency / g.samples) : 0,
      totalCost: Math.round(g.cost * 1000) / 1000,
    }))
    .sort((a, b) => b.successRate - a.successRate || b.samples - a.samples)
    .slice(0, limit)
}
