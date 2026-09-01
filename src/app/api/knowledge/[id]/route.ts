import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const doc = await db.document.findFirst({ where: { id, userId: user.id } })
    if (!doc) throw new ApiError(404, "Document introuvable.", "NOT_FOUND")
    await db.document.delete({ where: { id: doc.id } })
    return Response.json({ ok: true })
  })
}
