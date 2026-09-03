import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"

/** DELETE /api/ads/creatives/[id] — supprime une création. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const creative = await db.adCreative.findFirst({
      where: { id, campaign: { userId: user.id } },
    })
    if (!creative) throw new ApiError(404, "Création introuvable.", "NOT_FOUND")
    await db.adCreative.delete({ where: { id: creative.id } })
    await audit(req, {
      userId: user.id,
      action: "AD_CREATIVE_DELETED",
      entityType: "adCreative",
      entityId: creative.id,
    })
    return jsonOk({ deleted: true })
  })
}
