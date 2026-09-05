import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { revokeConnectorPermission } from "@/lib/connectors/gateway/permissions"

/**
 * DELETE /api/connectors/permissions/:id — révoque une permission
 * (vérification d'appartenance : seule la permission du propriétaire
 * peut être supprimée).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const revoked = await revokeConnectorPermission(id, user.id)
    if (!revoked) throw new ApiError(404, "Permission introuvable.")
    return jsonOk({ revoked: true, id })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
