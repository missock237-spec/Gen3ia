import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { deleteConnection } from "@/lib/connectors/core/connections"

/** DELETE /api/connectors/connections/:id — révoque et supprime. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const deleted = await deleteConnection(user.id, id)
    if (!deleted) throw new ApiError(404, "Connexion introuvable.")
    return jsonOk({ deleted: true, id })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
