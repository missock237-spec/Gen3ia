import { db } from "@/lib/db"
import { logger } from "./logger"

/**
 * Métriques des moteurs (amélioration « Observabilité »).
 *
 * Deux niveaux complémentaires :
 *  1. `EngineRun` (Prisma) — télémétrie durable : une ligne par exécution
 *     de moteur/phase avec durée, succès, tentatives, tokens, crédits.
 *     Source du tableau admin « Moteurs » et des agrégats (p95, taux de
 *     succès, débit horaire).
 *  2. compteurs en mémoire par instance — compteur de cache, état des
 *     circuit breakers (voir reliability/breaker.ts), inspection rapide.
 *
 * L'écriture de télémétrie ne fait JAMAIS échouer le pipeline principal.
 */

export interface EngineRunInput {
  engine: string
  taskId?: string | null
  userId?: string | null
  phase?: string | null
  ok: boolean
  errorCode?: string | null
  durationMs: number
  attempts?: number
  tokensIn?: number
  tokensOut?: number
  credits?: number
  detail?: Record<string, unknown> | null
}

/** Enregistre une exécution de moteur (best-effort, jamais bloquant). */
export async function recordEngineRun(input: EngineRunInput): Promise<void> {
  try {
    await db.engineRun.create({
      data: {
        engine: input.engine,
        taskId: input.taskId ?? null,
        userId: input.userId ?? null,
        phase: input.phase ?? null,
        ok: input.ok,
        errorCode: input.errorCode ?? null,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        attempts: input.attempts ?? 1,
        tokensIn: input.tokensIn ?? 0,
        tokensOut: input.tokensOut ?? 0,
        credits: input.credits ?? 0,
        detail: input.detail ? JSON.stringify(input.detail).slice(0, 4000) : null,
      },
    })
  } catch (err) {
    logger.warn("metrics: échec d'enregistrement EngineRun", {
      engine: input.engine,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ---------- Compteurs en mémoire (par instance serverless) ----------

interface Counters {
  engineRuns: Map<string, { total: number; ok: number; durationMs: number }>
  planCacheHits: number
  planCacheMisses: number
  vectorSearches: number
  breakerTrips: number
}

const g = globalThis as unknown as { gen3iaMetrics?: Counters }

function counters(): Counters {
  if (!g.gen3iaMetrics) {
    g.gen3iaMetrics = {
      engineRuns: new Map(),
      planCacheHits: 0,
      planCacheMisses: 0,
      vectorSearches: 0,
      breakerTrips: 0,
    }
  }
  return g.gen3iaMetrics
}

export function bumpEngineRun(engine: string, ok: boolean, durationMs: number) {
  const c = counters()
  const entry = c.engineRuns.get(engine) ?? { total: 0, ok: 0, durationMs: 0 }
  entry.total++
  if (ok) entry.ok++
  entry.durationMs += durationMs
  c.engineRuns.set(engine, entry)
}

export function bumpPlanCache(hit: boolean) {
  if (hit) counters().planCacheHits++
  else counters().planCacheMisses++
}

export function bumpVectorSearch() {
  counters().vectorSearches++
}

export function bumpBreakerTrip() {
  counters().breakerTrips++
}

export function snapshotInstanceMetrics() {
  const c = counters()
  const engineRuns: Record<string, { engine: string; total: number; okRate: number | null; avgDurationMs: number | null }> = {}
  for (const [engine, e] of c.engineRuns.entries()) {
    engineRuns[engine] = {
      engine,
      total: e.total,
      okRate: e.total > 0 ? Math.round((e.ok / e.total) * 1000) / 1000 : null,
      avgDurationMs: e.total > 0 ? Math.round(e.durationMs / e.total) : null,
    }
  }
  return {
    engineRuns,
    planCache: { hits: c.planCacheHits, misses: c.planCacheMisses },
    vectorSearches: c.vectorSearches,
    breakerTrips: c.breakerTrips,
  }
}

// ---------- Agrégats durables (requêtes admin) ----------

export interface EngineStats {
  engine: string
  runs: number
  okRate: number
  avgDurationMs: number
  p95DurationMs: number
  lastErrorCode: string | null
  lastRunAt: string | null
  tokensIn: number
  tokensOut: number
  credits: number
}

/** Agrège les EngineRun sur une fenêtre (défaut 7 jours) — utilisé par /api/admin/engines. */
export async function aggregateEngineStats(days = 7): Promise<EngineStats[]> {
  const since = new Date(Date.now() - days * 86_400_000)
  const runs = await db.engineRun.findMany({
    where: { createdAt: { gte: since } },
    select: {
      engine: true, ok: true, durationMs: true, errorCode: true,
      createdAt: true, tokensIn: true, tokensOut: true, credits: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20_000,
  })

  const byEngine = new Map<string, EngineStats & { durations: number[] }>()
  for (const r of runs) {
    let entry = byEngine.get(r.engine)
    if (!entry) {
      entry = {
        engine: r.engine, runs: 0, okRate: 0, avgDurationMs: 0, p95DurationMs: 0,
        lastErrorCode: null, lastRunAt: null, tokensIn: 0, tokensOut: 0, credits: 0,
        durations: [],
      }
      byEngine.set(r.engine, entry)
    }
    entry.runs++
    if (r.ok) (entry as { okCount?: number }).okCount = ((entry as { okCount?: number }).okCount ?? 0) + 1
    entry.durations.push(r.durationMs)
    entry.tokensIn += r.tokensIn
    entry.tokensOut += r.tokensOut
    entry.credits += r.credits
    if (!entry.lastRunAt) {
      entry.lastRunAt = r.createdAt.toISOString()
      entry.lastErrorCode = r.ok ? null : r.errorCode
    }
  }

  return [...byEngine.values()].map((e) => {
    const okCount = (e as { okCount?: number }).okCount ?? 0
    const durations = e.durations.slice().sort((a, b) => a - b)
    const p95 = durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0
    return {
      engine: e.engine,
      runs: e.runs,
      okRate: e.runs > 0 ? Math.round((okCount / e.runs) * 1000) / 1000 : 0,
      avgDurationMs: e.runs > 0 ? Math.round(e.durations.reduce((a, b) => a + b, 0) / e.runs) : 0,
      p95DurationMs: p95,
      lastErrorCode: e.lastErrorCode,
      lastRunAt: e.lastRunAt,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
      credits: Math.round(e.credits * 1000) / 1000,
    }
  })
}
