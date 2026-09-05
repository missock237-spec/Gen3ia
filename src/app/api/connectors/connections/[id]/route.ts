import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { deleteConnection } from "@/lib/connectors/core/connections"
import { deleteComposioConnection } from "@/lib/connectors/composio/provider"

/**
 * DELETE /api/connectors/connections/:id — révoque et supprime.
 * v4.2 : les id préfixés `cpc_` désignent une connexion hébergée
 * Composio (suppression via l'API plateforme, aucune donnée locale).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    if (id.startsWith("cpc_")) {
      const deleted = await deleteComposioConnection(user.id, id)
      if (!deleted) throw new ApiError(404, "Connexion Composio introuvable.")
      return jsonOk({ deleted: true, id, provider: "composio" })
    }
    const deleted = await deleteConnection(user.id, id)
    if (!deleted) throw new ApiError(404, "Connexion introuvable.")
    return jsonOk({ deleted: true, id, provider: "local" })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
