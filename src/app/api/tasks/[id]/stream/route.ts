import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session"
import { advanceTask } from "@/lib/engines/orchestrator"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Route SSE (Server-Sent Events) pour le streaming temps réel du pipeline.
 * Transmet les changements d'état, les étapes et la progression.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Authentification de la session
  const cookieHeader = req.headers.get("cookie") ?? ""
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  const token = match?.[1]
  const user = token ? await getSessionUser(decodeURIComponent(token)) : null

  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "Non autorisé" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const taskOwned = await db.task.findFirst({ where: { id, userId: user.id } })
  if (!taskOwned) {
    return new Response(JSON.stringify({ ok: false, error: "Tâche non trouvée" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let isAborted = false

      req.signal.addEventListener("abort", () => {
        isAborted = true
        try {
          controller.close()
        } catch {}
      })

      const sendEvent = (event: string, data: unknown) => {
        if (isAborted) return
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(payload))
        } catch {
          isAborted = true
        }
      }

      const parseJson = (val: string | null) => {
        if (!val) return null
        try {
          return JSON.parse(val)
        } catch {
          return null
        }
      }

      const fetchTaskSnapshot = async () => {
        const task = await db.task.findUnique({ where: { id } })
        if (!task) return null
        const steps = await db.taskStep.findMany({
          where: { taskId: id },
          orderBy: [{ phase: "asc" }, { stepIndex: "asc" }],
        })

        return {
          task: {
            id: task.id,
            prompt: task.prompt,
            status: task.status,
            selectedPlanId: task.selectedPlanId,
            costCredits: task.costCredits,
            tokensIn: task.tokensIn,
            tokensOut: task.tokensOut,
            attempts: task.attempts,
            error: task.error,
            createdAt: task.createdAt,
            completedAt: task.completedAt,
            analysis: parseJson(task.analysis),
            plans: parseJson(task.plans),
            planScores: parseJson(task.planScores),
            executionLog: parseJson(task.executionLog),
            verification: parseJson(task.verification),
            correctionLog: parseJson(task.correctionLog),
            learning: parseJson(task.learning),
            result: parseJson(task.result),
            pendingApproval: parseJson(task.pendingApproval),
          },
          steps: steps.map((s) => ({
            id: s.id,
            phase: s.phase,
            stepIndex: s.stepIndex,
            title: s.title,
            status: s.status,
            detail: parseJson(s.detail),
            startedAt: s.startedAt,
            finishedAt: s.finishedAt,
          })),
        }
      }

      // Envoi du snapshot initial
      const initialSnapshot = await fetchTaskSnapshot()
      if (initialSnapshot) {
        sendEvent("init", initialSnapshot)
      }

      let lastStatus = initialSnapshot?.task.status
      let ticks = 0

      // Boucle de streaming en direct
      while (!isAborted) {
        ticks++

        // Si la tâche est en cours, faire avancer l'orchestrateur
        if (
          lastStatus &&
          !["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL"].includes(lastStatus)
        ) {
          try {
            await advanceTask(id, { budgetMs: 8000 })
          } catch {}
        }

        const snapshot = await fetchTaskSnapshot()
        if (!snapshot) break

        if (snapshot.task.status !== lastStatus) {
          sendEvent("status_change", { oldStatus: lastStatus, newStatus: snapshot.task.status })
          lastStatus = snapshot.task.status
        }

        sendEvent("update", snapshot)

        // Envoi d'un ping toutes les 10 itérations pour maintenir la connexion
        if (ticks % 10 === 0) {
          sendEvent("ping", { time: new Date().toISOString() })
        }

        if (["COMPLETED", "FAILED", "CANCELLED"].includes(snapshot.task.status)) {
          sendEvent("done", { status: snapshot.task.status })
          break
        }

        // Attente de 1.5s entre deux ticks
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }

      if (!isAborted) {
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
