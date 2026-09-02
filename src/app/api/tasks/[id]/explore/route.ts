import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { ParallelExplorer } from "@/lib/engines/exploration"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: taskId } = await params
    const body = await readJson(req, { maxVariants: 3 })

    const task = await db.task.findFirst({ where: { id: taskId, userId: user.id } })
    if (!task) throw new ApiError(404, "Tâche introuvable", "NOT_FOUND")

    const explorer = new ParallelExplorer()
    // En production : récupérer les plans et les exécuter
    return Response.json({ ok: true, message: "Mode exploration déclenché", taskId })
  })
}
