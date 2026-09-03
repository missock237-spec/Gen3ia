import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const watch = await db.watchConfig.findFirst({
      where: { id, userId: user.id },
      include: { executions: { orderBy: { executedAt: "desc" }, take: 50 } },
    })
    if (!watch) throw new ApiError(404, "Surveillance introuvable", "NOT_FOUND")
    return Response.json({ ok: true, watch })
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const deleted = await db.watchConfig.deleteMany({ where: { id, userId: user.id } })
    if (deleted.count === 0) throw new ApiError(404, "Surveillance introuvable", "NOT_FOUND")
    return Response.json({ ok: true, deleted: true })
  })
}
