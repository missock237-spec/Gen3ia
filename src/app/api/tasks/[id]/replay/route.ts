import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { advanceTask } from "@/lib/engines/orchestrator"

const replaySchema = z.object({
  modifiedPrompt: z.string().min(2).max(5000).optional(),
  fromPhase: z.enum(["ANALYZING", "PLANNING", "SIMULATING", "EXECUTING"]).optional(),
  injectedAnalysis: z.record(z.unknown()).optional(),
  injectedPlans: z.array(z.record(z.unknown())).optional(),
  injectedVariables: z.record(z.unknown()).optional(),
})

/**
 * Route POST pour rejouer une tâche historique avec injection de valeurs modifiées.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { id } = await params
      const body = await readJson(req, replaySchema)

      const originalTask = await db.task.findFirst({ where: { id, userId: user.id } })
      if (!originalTask) {
        throw new ApiError(404, "Tâche d'origine non trouvée.", "NOT_FOUND")
      }

      const promptToUse = body.modifiedPrompt ?? originalTask.prompt

      // Préparation de la nouvelle tâche rejouée
      const newTask = await db.task.create({
        data: {
          userId: user.id,
          agentId: originalTask.agentId,
          prompt: promptToUse,
          status: body.injectedPlans ? "SIMULATING" : body.injectedAnalysis ? "PLANNING" : "QUEUED",
          analysis: body.injectedAnalysis ? JSON.stringify(body.injectedAnalysis) : originalTask.analysis,
          plans: body.injectedPlans ? JSON.stringify(body.injectedPlans) : null,
        },
      })

      // Journalisation dans l'audit
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "TASK_REPLAY",
          entityType: "task",
          entityId: newTask.id,
          detail: JSON.stringify({
            replayedFromId: originalTask.id,
            modifiedPrompt: !!body.modifiedPrompt,
            injectedAnalysis: !!body.injectedAnalysis,
            injectedPlans: !!body.injectedPlans,
          }),
        },
      })

      // Exécution initiale de la tâche rejouée
      const advanced = (await advanceTask(newTask.id)) ?? newTask

      return Response.json({
        ok: true,
        task: advanced,
        message: `Tâche rejouée avec succès (Nouvel ID : ${newTask.id})`,
      })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
