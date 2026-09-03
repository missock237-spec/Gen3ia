import { NextRequest } from "next/server"
import { handleRoute } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { listModels as listRegistryModels } from "@/lib/ai/model-registry"
import { modelRanking } from "@/lib/ai/performance"

/**
 * API unifiée v1 — GET /api/v1/models
 * Registre des modèles : provider, capacités, coûts, scores APPRIS
 * (successRate/quality/latence — jamais les clés).
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    await authenticateApiKey(req)
    checkRateLimit(req.headers.get("x-api-key") ?? "anonymous")

    const url = new URL(req.url)
    const provider = url.searchParams.get("provider") ?? undefined
    const taskType = url.searchParams.get("task") ?? undefined
    const includeStats = url.searchParams.get("stats") === "1"

    const models = await listRegistryModels({ provider, taskType })

    let ranking: Awaited<ReturnType<typeof modelRanking>> = []
    if (includeStats) {
      ranking = await modelRanking(taskType ?? undefined, 20)
    }

    return Response.json({
      ok: true,
      count: models.length,
      models: models.map((m) => ({
        provider: m.provider,
        modelId: m.modelId,
        name: m.name,
        modality: m.modality,
        supportedTasks: m.supportedTasks,
        contextLength: m.contextLength,
        capabilities: m.capabilities,
        license: m.license,
        commercialUse: m.commercialUse,
        availability: m.availability,
        endpointType: m.endpointType,
        cost: { creditsPerKIn: m.creditsPerKIn, creditsPerKOut: m.creditsPerKOut },
        performance: {
          qualityScore: m.qualityScore,
          successRate: m.successRate,
          avgLatencyMs: m.avgLatencyMs,
          sampleCount: m.sampleCount,
          lastEvaluated: m.lastEvaluated,
        },
        status: m.status,
        tags: m.tags,
      })),
      ...(includeStats ? { ranking } : {}),
    })
  })
}
