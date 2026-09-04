import { NextRequest } from "next/server"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listModels } from "@/lib/ai/model-registry"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/models — options de modèles pour le sélecteur de la barre
 * de saisie (session utilisateur). Registre public : provider, nom,
 * tâches supportées, qualité apprise — jamais de clés ni de coûts.
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireUser(req)
    const models = await listModels()
    return jsonOk({
      models: models.map((m) => ({
        id: m.id,
        provider: m.provider,
        modelId: m.modelId,
        name: m.name,
        modality: m.modality,
        supportedTasks: m.supportedTasks.slice(0, 6),
        qualityScore: Math.round(m.qualityScore * 100) / 100,
        contextLength: m.contextLength,
      })),
    })
  })
}
