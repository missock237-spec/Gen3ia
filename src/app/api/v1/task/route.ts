import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { authenticateApiKey, resolveAgent, checkRateLimit } from "@/lib/auth/apikey"
import { advanceTask } from "@/lib/engines/orchestrator"
import { getBalance } from "@/lib/credits/ledger"

const taskSchema = z.object({
  prompt: z.string().min(10).max(8000),
  agent_slug: z.string().max(60).optional(),
  mode: z.enum(["async", "sync"]).default("sync"),
})

/**
 * API publique v1 — POST /api/v1/task
 * Lance une tâche d'orchestration complète (analyse → plans → exécution
 * → vérification). En mode sync, le pipeline avance jusqu'au budget de la
 * requête puis le SDK doit sonder /v1/task/{id} (exécution reprise-ez).
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)
    const body = await readJson(req, taskSchema)

    const agent = body.agent_slug ? await resolveAgent(ctx, body.agent_slug) : ctx.agent
    if (agent) {
      const accessible =
        ctx.apiKey.agentId === agent.id ||
        agent.userId === ctx.user.id ||
        agent.visibility === "MARKETPLACE"
      if (!accessible) {
        throw new ApiError(403, "Cet agent n'est pas accessible avec cette clé.", "FORBIDDEN")
      }
    }

    const balance = await getBalance(ctx.user.id)
    if (balance <= 0) {
      throw new ApiError(402, "Crédits insuffisants sur le compte propriétaire de la clé.", "NO_CREDITS")
    }

    const task = await db.task.create({
      data: { userId: ctx.user.id, prompt: body.prompt.trim(), agentId: agent?.id ?? null },
    })

    if (body.mode === "async") {
      // L'exécution démarre immédiatement en arrière-plan du budget de requête.
      const advanced = await advanceTask(task.id, { budgetMs: 15_000 })
      return Response.json({
        ok: true,
        task_id: task.id,
        status: (advanced ?? task).status,
        poll_url: `/api/v1/task/${task.id}`,
      })
    }

    const advanced = (await advanceTask(task.id, { budgetMs: 50_000 })) ?? task
    return Response.json({
      ok: true,
      task_id: task.id,
      status: advanced.status,
      poll_url: `/api/v1/task/${task.id}`,
    })
  })
}
