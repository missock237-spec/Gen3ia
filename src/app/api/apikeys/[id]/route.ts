import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const key = await db.apiKey.findFirst({ where: { id, userId: user.id } })
    if (!key) throw new ApiError(404, "Clé introuvable.", "NOT_FOUND")
    if (key.revoked) throw new ApiError(409, "Cette clé est déjà révoquée.", "ALREADY_REVOKED")
    await db.apiKey.update({ where: { id: key.id }, data: { revoked: true } })
    await audit(req, { userId: user.id, action: "APIKEY_REVOKED", entityType: "apikey", entityId: key.id })
    return Response.json({ ok: true })
  })
}
