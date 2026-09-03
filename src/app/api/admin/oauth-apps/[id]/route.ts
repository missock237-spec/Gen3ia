import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { invalidateDynamicCache } from "@/lib/connectors/apps/dynamic"
import { audit } from "@/lib/engines/audit"

/**
 * DELETE /api/admin/oauth-apps/[id]
 * Retire les identifiants OAuth d'une app (la déconnecte pour les NOUVELLES
 * connexions ; les connexions actives restent révocables par leurs titulaires).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(req, async () => {
    const admin = await requireAdmin(req)
    const { id } = await params
    const row = await db.oAuthAppConfig.findUnique({ where: { id } })
    if (!row) throw new ApiError(404, "Configuration OAuth introuvable.")
    await db.oAuthAppConfig.delete({ where: { id } })
    invalidateDynamicCache()
    await audit(req, {
      userId: admin.id,
      action: "ADMIN_OAUTH_APP_DELETED",
      entityType: "oauth_app",
      entityId: id,
      detail: { appSlug: row.appSlug },
    })
    return jsonOk({ deleted: id, appSlug: row.appSlug })
  })
}
