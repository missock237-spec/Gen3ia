import { db } from "@/lib/db"
import { DEFAULT_WEIGHTS } from "@/lib/engines/types"

/**
 * Configuration système (KV JSON, table SystemConfig).
 * Éditable depuis l'interface admin (pondérations, interrupteurs).
 * Lecture : system > valeur par défaut ; l'utilisateur garde la priorité
 * sur ses propres pondérations (voir orchestrator.userWeights()).
 */

export interface SystemSettings {
  /** Pondérations d'évaluation appliquées quand l'utilisateur n'en définit pas. */
  evaluatorWeights: typeof DEFAULT_WEIGHTS
  /** Cache de plans global (on/off) — PLAN_CACHE=off gagne toujours. */
  planCache: boolean
  /** Approbation humaine des plans par défaut pour les nouveaux utilisateurs. */
  defaultPlanApproval: "auto" | "manual"
  /** Plafond global de tentatives par tâche. */
  maxTotalRetries: number
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  evaluatorWeights: DEFAULT_WEIGHTS,
  planCache: true,
  defaultPlanApproval: "auto",
  maxTotalRetries: 8,
}

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const row = await db.systemConfig.findUnique({ where: { key: "settings" } })
    if (!row) return DEFAULT_SYSTEM_SETTINGS
    const parsed = JSON.parse(row.value) as Partial<SystemSettings>
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...parsed,
      evaluatorWeights: { ...DEFAULT_WEIGHTS, ...(parsed.evaluatorWeights ?? {}) },
    }
  } catch {
    return DEFAULT_SYSTEM_SETTINGS
  }
}

export async function updateSystemSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings()
  const next: SystemSettings = {
    ...current,
    ...patch,
    evaluatorWeights: { ...current.evaluatorWeights, ...(patch.evaluatorWeights ?? {}) },
  }
  // Normalisation : les 6 pondérations somment à ~1 (tolérance 0.02).
  const w = next.evaluatorWeights
  const sum = w.successRate + w.accuracy + w.cost + w.latency + w.risk + w.completeness
  if (sum > 0) {
    const factor = 1 / sum
    next.evaluatorWeights = {
      successRate: Math.round(w.successRate * factor * 1000) / 1000,
      accuracy: Math.round(w.accuracy * factor * 1000) / 1000,
      cost: Math.round(w.cost * factor * 1000) / 1000,
      latency: Math.round(w.latency * factor * 1000) / 1000,
      risk: Math.round(w.risk * factor * 1000) / 1000,
      completeness: Math.round(w.completeness * factor * 1000) / 1000,
    }
  }
  next.maxTotalRetries = Math.max(2, Math.min(20, Math.round(next.maxTotalRetries)))

  await db.systemConfig.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return next
}
