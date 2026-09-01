import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { resolveHumanApproval } from "@/lib/engines/orchestrator"
import { advanceTask } from "@/lib/engines/orchestrator"

const approveSchema = z.object({
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
})

/** Human-in-the-loop : approuve ou refuse une opération sensible. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const body = await readJson(req, approveSchema)

    const task = await db.task.findFirst({ where: { id, userId: user.id } })
    if (!task) throw new ApiError(404, "Tâche introuvable.", "NOT_FOUND")

    const resolved = await resolveHumanApproval(task.id, user.id, body.approved, body.reason)
    // Si approuvée, on relance immédiatement l'exécution dans ce budget de requête.
    const advanced = body.approved ? ((await advanceTask(task.id)) ?? resolved) : resolved
    return Response.json({ ok: true, task: advanced })
  })
}
