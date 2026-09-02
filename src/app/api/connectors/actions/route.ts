import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { isComposioConfigured, listActionsForUser } from "@/lib/connectors/composio"

/**
 * GET /api/connectors/actions — actions disponibles pour l'utilisateur
 * (filtrées sur ses apps connectées + actions sans auth).
 * Query : toolkit, search, limit (défaut 25, max 50).
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    if (!isComposioConfigured()) {
      throw new ApiError(
        503,
        "Connecteurs non activés : COMPOSIO_API_KEY n'est pas configurée sur le serveur.",
        "CONNECTOR_NOT_CONFIGURED"
      )
    }
    const sp = req.nextUrl.searchParams
    const actions = await listActionsForUser(user.id, {
      toolkit: sp.get("toolkit") ?? undefined,
      search: sp.get("search") ?? undefined,
      limit: sp.get("limit") ? Math.min(Number(sp.get("limit")), 50) : 25,
    })
    return jsonOk({ actions })
  })
}
