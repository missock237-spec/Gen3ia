import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { sharedMemory } from "@/lib/engines/shared-memory"
import { swarmBus } from "@/lib/engines/swarm"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: sessionId } = await params

    const session = await db.swarmSession.findFirst({
      where: { id: sessionId, userId: user.id },
      include: { subTasks: true },
    })
    if (!session) throw new ApiError(404, "Session introuvable", "NOT_FOUND")

    const memories = await sharedMemory.list(sessionId)
    const messages = await swarmBus.getHistory(sessionId)

    return Response.json({
      ok: true,
      session: {
        id: session.id,
        prompt: session.prompt,
        strategy: session.strategy,
        status: session.status,
        result: session.result ? JSON.parse(session.result) : null,
        subTasks: session.subTasks,
        sharedMemories: memories,
        messages,
      },
    })
  })
}
