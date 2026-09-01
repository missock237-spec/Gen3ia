import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { forgetMemory } from "@/lib/memory/store"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const result = await forgetMemory(user.id, id)
    if (result.count === 0) throw new ApiError(404, "Mémoire introuvable.", "NOT_FOUND")
    return Response.json({ ok: true })
  })
}
