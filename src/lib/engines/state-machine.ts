import { db } from "@/lib/db"
import type { Task } from "@prisma/client"

/**
 * State Manager — machine à états stricte du Task Center.
 * Chaque transition est validée ; tout état est persisté en base
 * (checkpoint implicite : une tâche peut reprendre après interruption).
 */

export const TASK_STATUSES = [
  "QUEUED",
  "ANALYZING",
  "PLANNING",
  "SIMULATING",
  "WAITING_PLAN_APPROVAL", // v3.1 : mode Explain — l'utilisateur choisit/modifie le plan
  "EXECUTING",
  "VERIFYING",
  "LEARNING",
  "WAITING_FOR_HUMAN",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Transitions autorisées — toute transition interdite est rejetée. */
const TRANSITIONS: Record<string, string[]> = {
  QUEUED: ["ANALYZING", "CANCELLED", "FAILED"],
  ANALYZING: ["PLANNING", "FAILED", "CANCELLED"],
  PLANNING: ["SIMULATING", "FAILED", "CANCELLED"],
  SIMULATING: ["EXECUTING", "WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL", "FAILED", "CANCELLED"],
  WAITING_PLAN_APPROVAL: ["EXECUTING", "PLANNING", "CANCELLED", "FAILED"],
  WAITING_FOR_HUMAN: ["EXECUTING", "CANCELLED", "FAILED"],
  EXECUTING: ["VERIFYING", "PLANNING", "FAILED", "CANCELLED"],
  VERIFYING: ["LEARNING", "EXECUTING", "PLANNING", "FAILED", "CANCELLED"],
  LEARNING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
}

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export async function transitionTask(
  task: Task,
  to: TaskStatus,
  extra: Partial<Task> = {}
): Promise<Task> {
  const from = task.status
  if (from === to) return task
  if (!canTransition(from, to)) {
    throw new Error(`Transition invalide : ${from} → ${to}`)
  }
  const patch: Partial<Task> = { status: to, ...extra }
  if (to === "EXECUTING" && !task.startedAt) patch.startedAt = new Date()
  if (to === "COMPLETED" || to === "FAILED") patch.completedAt = new Date()
  patch.pendingApproval = to === "WAITING_FOR_HUMAN" ? (extra.pendingApproval ?? null) : null
  return db.task.update({ where: { id: task.id }, data: patch })
}

/** Phases actives du pipeline (pour les étapes visibles). */
export const PIPELINE_PHASES = [
  "ANALYZING",
  "PLANNING",
  "SIMULATING",
  "EXECUTING",
  "VERIFYING",
  "LEARNING",
  "DELIVERING",
] as const

export type PipelinePhase = (typeof PIPELINE_PHASES)[number]

/** Journalise une étape de pipeline (création ou mise à jour). */
export async function recordStep(
  taskId: string,
  phase: PipelinePhase,
  stepIndex: number,
  title: string,
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED" | "WAITING",
  detail?: unknown
) {
  const existing = await db.taskStep.findFirst({
    where: { taskId, phase, stepIndex },
  })
  const data = {
    status,
    title,
    detail: detail ? JSON.stringify(detail) : undefined,
    startedAt: status === "RUNNING" ? new Date() : undefined,
    finishedAt: status === "DONE" || status === "FAILED" || status === "SKIPPED" ? new Date() : undefined,
  }
  if (existing) {
    return db.taskStep.update({ where: { id: existing.id }, data })
  }
  return db.taskStep.create({ data: { taskId, phase, stepIndex, ...data } })
}

/**
 * Fusionne un champ JSON d'une tâche — v3.1 : verrouillage optimiste.
 *
 * L'ancienne version (lecture-modification-écriture aveugle) souffrait de
 * pertes de mise à jour quand deux sondages concurrents (UI + SDK) faisaient
 * avancer la même tâche. Désormais : chaque écriture incrémente Task.version
 * et ne réussit que si la version lue est toujours courante (3 tentatives,
 * puis repli inconditionnel — l'idempotence par champ vide du pipeline
 * borne le risque résiduel).
 */
export async function mergeTaskJson<
  K extends "analysis" | "plans" | "planScores" | "executionLog" | "verification" | "correctionLog" | "learning" | "result"
>(
  taskId: string,
  field: K,
  value: unknown
): Promise<void> {
  const serialized = value === null || value === undefined ? null : JSON.stringify(value)
  for (let i = 0; i < 3; i++) {
    const task = await db.task.findUnique({ where: { id: taskId }, select: { version: true } })
    if (!task) return
    const result = await db.task.updateMany({
      where: { id: taskId, version: task.version },
      data: { [field]: serialized, version: { increment: 1 } } as Record<string, unknown>,
    })
    if (result.count === 1) return
    // Version concurrente modifiée : nouvelle tentative de lecture.
  }
  await db.task
    .update({ where: { id: taskId }, data: { [field]: serialized } as Record<string, unknown> })
    .catch(() => undefined)
}
