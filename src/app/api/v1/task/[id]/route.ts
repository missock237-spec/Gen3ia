import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { advanceTask } from "@/lib/engines/orchestrator"

/**
 * API publique v1 — GET /api/v1/task/{id}
 * Statut d'une tâche ; chaque appel poursuit l'avancement du pipeline
 * (sondage = moteur d'exécution, compatible serverless).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)
    const { id } = await params

    const owned = await db.task.findFirst({ where: { id, userId: ctx.user.id } })
    if (!owned) throw new ApiError(404, "Tâche introuvable.", "NOT_FOUND")

    let task = owned
    if (!["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN"].includes(task.status)) {
      task = (await advanceTask(task.id, { budgetMs: 30_000 })) ?? task
    }

     
    const result = task.result ? JSON.parse(task.result) : null
    return Response.json({
      ok: true,
      task_id: task.id,
      status: task.status,
      error: task.error,
      pending_approval: task.status === "WAITING_FOR_HUMAN",
      result: result
        ? {
            answer: result.answer,
            plan: result.plan ?? null,
            verification: result.verification ?? null,
            metrics: result.metrics ?? null,
          }
        : null,
      usage: { tokensIn: task.tokensIn, tokensOut: task.tokensOut, credits: task.costCredits },
    })
  })
}
