import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const skill = await db.skill.findFirst({ where: { id, userId: user.id } })
    if (!skill) throw new ApiError(404, "Compétence introuvable.", "NOT_FOUND")
    await db.skill.delete({ where: { id: skill.id } })
    return Response.json({ ok: true })
  })
}
