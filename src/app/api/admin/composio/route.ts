import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import {
  clearComposioKey,
  invalidateComposioKeyCache,
  setComposioKey,
} from "@/lib/connectors/composio/client"
import { invalidateComposioCaches, composioStatus } from "@/lib/connectors/composio/provider"

const setKeySchema = z.object({
  apiKey: z.string().min(8).max(512),
})

/**
 * GET /api/admin/composio — statut de l'intégration Composio.
 * Réponse SANITISÉE : aucun secret, aucune clé (jamais sérialisée).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const status = await composioStatus()
    return jsonOk({
      ...status,
      // Indication de provenance sans jamais révéler la valeur.
      managedByEnv: status.source === "env",
      hint: status.source ? "configurée" : "absente",
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}

/**
 * POST /api/admin/composio — enregistre la clé API Composio
 * (chiffrée AES-256-GCM en base). Rotation immédiate : caches
 * invalidés au retour. La clé n'est JAMAIS renvoyée en réponse.
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const admin = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const parsed = setKeySchema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(400, "Corps invalide : apiKey requise (8 caractères minimum).")
    }
    await setComposioKey(parsed.data.apiKey, admin.id)
    invalidateComposioKeyCache()
    invalidateComposioCaches()
    // Vérification immédiate : la clé doit être acceptée par la plateforme.
    const status = await composioStatus()
    return jsonOk({
      saved: true,
      status: {
        configured: status.configured,
        source: status.source,
        toolkitCount: status.toolkitCount,
        toolkitSource: status.toolkitSource,
        liveError: status.liveError,
      },
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}

/** DELETE /api/admin/composio — supprime la clé stockée en base. */
export async function DELETE(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const removed = await clearComposioKey()
    invalidateComposioCaches()
    return jsonOk({ removed })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
