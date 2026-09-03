import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { advanceTask, enforceApprovalExpiry } from "@/lib/engines/orchestrator"
import { transitionTask } from "@/lib/engines/state-machine"
import { hydrateEvidence } from "@/lib/tasks/artifacts"
import { approvalSecondsLeft } from "@/lib/security/hitl"

/**
 * Détail d'une tâche — poursuit AUSSI l'avancement du pipeline si la tâche
 * est active (chaque sondage du client fait progresser l'orchestration,
 * dans la limite du budget temporel de la requête).
 * v3.1 : hydratation des preuves externalisées (TaskArtifact gzip).
 * v3.6 : expiration paresseuse des demandes HITL en attente + compte à
 * rebours d'approbation exposé à l'UI.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const owned = await db.task.findFirst({ where: { id, userId: user.id } })
    if (!owned) throw new ApiError(404, "Tâche introuvable.", "NOT_FOUND")

    let task = owned
    if (["WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL"].includes(task.status)) {
      // v3.6 — annulation automatique des approbations expirées (fail-safe).
      task = (await enforceApprovalExpiry(task.id)) ?? task
    } else if (!["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
      task = (await advanceTask(task.id)) ?? task
    }

    const steps = await db.taskStep.findMany({
      where: { taskId: task.id },
      orderBy: [{ phase: "asc" }, { stepIndex: "asc" }],
    })

    const parse = <T>(v: string | null): T | null => {
      if (!v) return null
      try {
        return JSON.parse(v) as T
      } catch {
        return null
      }
    }

    // v3.1 : hydratation des preuves externalisées (artefacts gzip → contenu complet).
    const hydrateEvidenceField = async <T extends { evidence?: Array<{ artifactId?: string }> }>(
      parsed: T | null
    ): Promise<T | null> => {
      if (!parsed?.evidence?.length) return parsed
      try {
        const hydrated = await hydrateEvidence(parsed.evidence as never)
        return { ...parsed, evidence: hydrated }
      } catch {
        return parsed
      }
    }
    const executionLog = await hydrateEvidenceField(parse<{ finalAnswer?: string; steps?: unknown[]; evidence?: Array<{ artifactId?: string }> }>(task.executionLog))
    const result = await hydrateEvidenceField(parse<{ answer?: string; evidence?: Array<{ artifactId?: string }> }>(task.result))

    return Response.json({
      ok: true,
      task: {
        id: task.id, prompt: task.prompt, status: task.status, agentId: task.agentId,
        selectedPlanId: task.selectedPlanId, costCredits: task.costCredits,
        tokensIn: task.tokensIn, tokensOut: task.tokensOut, attempts: task.attempts,
        totalRetries: task.totalRetries,
        error: task.error, createdAt: task.createdAt, completedAt: task.completedAt,
        analysis: parse(task.analysis),
        plans: parse(task.plans),
        planScores: parse(task.planScores),
        executionLog,
        verification: parse(task.verification),
        correctionLog: parse(task.correctionLog),
        learning: parse(task.learning),
        result,
        pendingApproval: parse(task.pendingApproval),
        // v3.6 — compte à rebours d'approbation (secondes restantes, 0 si expirée).
        approvalSecondsLeft: approvalSecondsLeft(parse(task.pendingApproval)),
      },
      steps: steps.map((s) => ({
        id: s.id, phase: s.phase, stepIndex: s.stepIndex, title: s.title, status: s.status,
        detail: parse(s.detail), startedAt: s.startedAt, finishedAt: s.finishedAt,
      })),
    })
  })
}

/** Annulation d'une tâche active. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const task = await db.task.findFirst({ where: { id, userId: user.id } })
    if (!task) throw new ApiError(404, "Tâche introuvable.", "NOT_FOUND")
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
      throw new ApiError(409, "Cette tâche est déjà terminée.", "ALREADY_DONE")
    }
    const cancelled = await transitionTask(task, "CANCELLED", { error: "Annulée par l'utilisateur." })
    return Response.json({ ok: true, task: cancelled })
  })
}
