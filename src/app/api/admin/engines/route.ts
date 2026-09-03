import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { listEngineHealth } from "@/lib/engines/sdk"
import { engines } from "@/lib/engines/engines"
import { getSystemSettings, updateSystemSettings } from "@/lib/system/config"
import { aggregateEngineStats, snapshotInstanceMetrics } from "@/lib/observability/metrics"
import { snapshotBreakers, resetBreakers } from "@/lib/reliability/breaker"
import { planCacheStats, purgePlanCache, warmupPlanCache, evictStaleEntries } from "@/lib/engines/plan-cache"
import { vectorStoreStats } from "@/lib/rag/vector-store"
import { audit } from "@/lib/engines/audit"
import { queueDepth, queueMode } from "@/lib/queue/task-queue"

/**
 * Interface d'administration des moteurs (amélioration « Interface d'Admin
 * pour les Moteurs »).
 *
 * GET   : santé + performances de chaque moteur (EngineRun 7 j), état des
 *         circuit breakers, cache de plans, stockage vectoriel, métriques
 *         d'instance, configuration système courante, file de tâches.
 * PATCH : pondérations d'évaluation globales + réglages système.
 * POST  : actions — purge du cache de plans, préchauffage des templates,
 *         éviction LRI, réinitialisation des breakers.
 */

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    // Force l'instanciation du registre (télémétrie complète).
    engines()
    const [health, durableStats, cache, vectors, system, taskQueue] = await Promise.all([
      listEngineHealth(),
      aggregateEngineStats(7),
      planCacheStats(),
      vectorStoreStats(),
      getSystemSettings(),
      queueDepth(),
    ])
    return Response.json({
      ok: true,
      engines: health,
      durableStats,
      breakers: snapshotBreakers(),
      planCache: cache,
      vectorStore: vectors,
      instance: snapshotInstanceMetrics(),
      taskQueue: { mode: queueMode(), depth: taskQueue },
      system,
    })
  })
}

const patchSchema = z.object({
  evaluatorWeights: z
    .object({
      successRate: z.number().min(0).max(1),
      accuracy: z.number().min(0).max(1),
      cost: z.number().min(0).max(1),
      latency: z.number().min(0).max(1),
      risk: z.number().min(0).max(1),
      completeness: z.number().min(0).max(1),
    })
    .optional(),
  planCache: z.boolean().optional(),
  defaultPlanApproval: z.enum(["auto", "manual"]).optional(),
  maxTotalRetries: z.number().int().min(2).max(20).optional(),
})

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const admin = await requireAdmin(req)
      const body = await readJson(req, patchSchema)
      const next = await updateSystemSettings(body)
      await audit(req, {
        userId: admin.id,
        action: "SYSTEM_SETTINGS_UPDATED",
        entityType: "system",
        detail: body as Record<string, unknown>,
      })
      return Response.json({ ok: true, system: next })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}

const actionSchema = z.object({
  action: z.enum(["purge-plan-cache", "warmup-plan-cache", "evict-plan-cache", "reset-breakers"]),
  userId: z.string().optional(), // purge/éviction limitée à un utilisateur
})

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const admin = await requireAdmin(req)
      const body = await readJson(req, actionSchema)

      if (body.action === "purge-plan-cache") {
        const purged = await purgePlanCache(body.userId)
        await audit(req, {
          userId: admin.id, action: "PLAN_CACHE_PURGED", entityType: "system", detail: { purged },
        })
        return Response.json({ ok: true, purged, planCache: await planCacheStats() })
      }

      if (body.action === "warmup-plan-cache") {
        // v3.6 — préchauffage de la couche partagée (templates officiels).
        const warmup = await warmupPlanCache()
        await audit(req, {
          userId: admin.id, action: "PLAN_CACHE_WARMED_UP", entityType: "system",
          detail: { templates: warmup.templates, created: warmup.created },
        })
        return Response.json({ ok: true, warmup, planCache: await planCacheStats() })
      }

      if (body.action === "evict-plan-cache") {
        // v3.6 — éviction LRI fine (entrées froides puis plafonds LRU).
        const evicted = await evictStaleEntries(body.userId)
        await audit(req, {
          userId: admin.id, action: "PLAN_CACHE_EVICTED", entityType: "system", detail: evicted,
        })
        return Response.json({ ok: true, evicted, planCache: await planCacheStats() })
      }

      resetBreakers()
      await audit(req, {
        userId: admin.id, action: "BREAKERS_RESET", entityType: "system",
      })
      return Response.json({ ok: true, breakers: snapshotBreakers() })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
