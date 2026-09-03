import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"
import { registryStats, listModels, seedRegistry, syncFromHuggingFace, invalidateRegistryCache } from "@/lib/ai/model-registry"
import { modelRanking } from "@/lib/ai/performance"
import { computeOverview } from "@/lib/compute/scheduler"
import { storageStats } from "@/lib/hf/storage"
import { listEndpoints, syncEndpoints } from "@/lib/hf/endpoints"
import { isHfConfigured } from "@/lib/hf/client"

/**
 * Admin — GET /api/admin/models-registry
 * Vue consolidée MODEL REGISTRY + COMPUTE + STORAGE + PERFORMANCE + COST
 * (Phase 26 : surveillance complète de la couche Model & Compute).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const url = new URL(req.url)
    const provider = url.searchParams.get("provider") ?? undefined
    const taskType = url.searchParams.get("task") ?? undefined

    const [stats, models, ranking, compute, storage, endpoints, selections] = await Promise.all([
      registryStats(),
      listModels({ provider, taskType, includeDisabled: true }),
      modelRanking(taskType ?? undefined, 20).catch(() => []),
      computeOverview(),
      storageStats().catch(() => ({ totalObjects: 0, totalBytes: 0, byBucket: [] })),
      listEndpoints().catch(() => []),
      db.modelSelection.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true, provider: true, taskType: true, score: true, confidence: true,
          reason: true, costEstimate: true, createdAt: true,
          model: { select: { modelId: true, name: true } },
        },
      }).catch(() => []),
    ])

    // Coût par modèle (fenêtre glissante 30 j — ModelPerformance).
    const costByModel = await db.modelPerformance.groupBy({
      by: ["provider", "modelId"],
      _sum: { costCredits: true },
      _count: { _all: true },
      orderBy: { _sum: { costCredits: "desc" } },
      take: 20,
    }).catch(() => [])

    return Response.json({
      ok: true,
      hfConfigured: isHfConfigured(),
      registry: {
        stats,
        models: models.map((m) => ({
          provider: m.provider, modelId: m.modelId, name: m.name,
          modality: m.modality, supportedTasks: m.supportedTasks,
          contextLength: m.contextLength, endpointType: m.endpointType,
          availability: m.availability, status: m.status, priority: m.priority,
          cost: { creditsPerKIn: m.creditsPerKIn, creditsPerKOut: m.creditsPerKOut },
          learned: {
            qualityScore: m.qualityScore, successRate: m.successRate,
            avgLatencyMs: m.avgLatencyMs, sampleCount: m.sampleCount,
            lastEvaluated: m.lastEvaluated,
          },
        })),
      },
      performance: {
        ranking,
        recentSelections: selections,
      },
      compute,
      storage,
      endpoints,
      cost: {
        byModel: costByModel.map((c) => ({
          provider: c.provider,
          modelId: c.modelId,
          executions: c._count._all,
          costCredits: c._sum.costCredits ?? 0,
        })),
      },
    })
  })
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("seed"),
  }),
  z.object({
    action: z.literal("sync-hf"),
    limit: z.number().int().min(5).max(100).default(30),
  }),
  z.object({
    action: z.literal("sync-endpoints"),
  }),
  z.object({
    action: z.literal("set-status"),
    provider: z.string().min(1).max(30),
    modelId: z.string().min(1).max(200),
    status: z.enum(["ACTIVE", "DISABLED", "EXPERIMENTAL"]),
  }),
  z.object({
    action: z.literal("set-priority"),
    provider: z.string().min(1).max(30),
    modelId: z.string().min(1).max(200),
    priority: z.number().int().min(1).max(1000),
  }),
])

/** POST /api/admin/models-registry — actions admin sur le registre. */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const admin = await requireAdmin(req)
    const body = await readJson(req, actionSchema)

    if (body.action === "seed") {
      const result = await seedRegistry()
      await audit(null, { userId: admin.id, action: "ADMIN_MODELS_SEED", entityType: "registry", detail: result })
      return Response.json({ ok: true, ...result })
    }

    if (body.action === "sync-hf") {
      if (!isHfConfigured()) {
        return Response.json({ ok: false, error: "HF_TOKEN absent.", code: "HF_NOT_CONFIGURED" }, { status: 503 })
      }
      const result = await syncFromHuggingFace(body.limit)
      invalidateRegistryCache()
      await audit(null, { userId: admin.id, action: "ADMIN_MODELS_SYNC_HF", entityType: "registry", detail: { discovered: result.discovered, refreshed: result.refreshed } })
      return Response.json({ ok: true, discovered: result.discovered, refreshed: result.refreshed, models: result.models.slice(0, 50) })
    }

    if (body.action === "sync-endpoints") {
      const result = await syncEndpoints()
      await audit(null, { userId: admin.id, action: "ADMIN_ENDPOINTS_SYNC", entityType: "registry", detail: result })
      return Response.json({ ok: true, ...result })
    }

    // set-status / set-priority : édition d'un modèle du registre.
    const row = await db.aIModel.findFirst({ where: { provider: body.provider, modelId: body.modelId } })
    if (!row) {
      return Response.json({ ok: false, error: "Modèle introuvable dans le registre.", code: "NOT_FOUND" }, { status: 404 })
    }

    if (body.action === "set-status") {
      await db.aIModel.update({ where: { id: row.id }, data: { status: body.status } })
      invalidateRegistryCache()
      await audit(null, { userId: admin.id, action: "ADMIN_MODEL_STATUS", entityType: "aiModel", entityId: row.id, detail: { status: body.status } })
      return Response.json({ ok: true, provider: body.provider, modelId: body.modelId, status: body.status })
    }

    await db.aIModel.update({ where: { id: row.id }, data: { priority: body.priority } })
    invalidateRegistryCache()
    await audit(null, { userId: admin.id, action: "ADMIN_MODEL_PRIORITY", entityType: "aiModel", entityId: row.id, detail: { priority: body.priority } })
    return Response.json({ ok: true, provider: body.provider, modelId: body.modelId, priority: body.priority })
  })
}
