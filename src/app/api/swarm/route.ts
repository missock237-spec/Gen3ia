import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getBalance } from "@/lib/credits/ledger"
import { SwarmOrchestrator } from "@/lib/engines/swarm"
import { DebateOrchestrator } from "@/lib/engines/debate"

const createSwarmSchema = z.object({
  prompt: z.string().min(10).max(8000),
  strategy: z.enum(["HIERARCHICAL", "DEBATE"]).default("HIERARCHICAL"),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSwarmSchema)

    const balance = await getBalance(user.id)
    if (balance <= 0) throw new ApiError(402, "Crédits insuffisants", "NO_CREDITS")

    if (body.strategy === "DEBATE") {
      const debate = new DebateOrchestrator()
      const { result } = await debate.runDebate(user.id, body.prompt)
      return Response.json({ ok: true, strategy: "DEBATE", result })
    } else {
      const swarm = new SwarmOrchestrator()
      const session = await swarm.createSession(user.id, body.prompt)
      const execution = await swarm.executeSession(session.id)
      return Response.json({ ok: true, strategy: "HIERARCHICAL", sessionId: session.id, result: execution.finalResult })
    }
  })
}
