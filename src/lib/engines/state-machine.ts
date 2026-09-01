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
  SIMULATING: ["EXECUTING", "WAITING_FOR_HUMAN", "FAILED", "CANCELLED"],
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
  if (to === "WAITING_FOR_HUMAN") {
    patch.pendingApproval = extra.pendingApproval ?? null
  } else if (to !== "WAITING_FOR_HUMAN") {
    patch.pendingApproval = null
  }
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
  return db.taskStep.create({ data: { taskId, phase, stepIndex, title, ...data } })
}

/** Fusionne un champ JSON d'une tâche (lecture-modification-écriture sûre). */
export async function mergeTaskJson<K extends "analysis" | "plans" | "planScores" | "executionLog" | "verification" | "correctionLog" | "learning" | "result">(
  taskId: string,
  field: K,
  value: unknown
): Promise<void> {
  await db.task.update({
    where: { id: taskId },
    data: { [field]: JSON.stringify(value) } as Record<string, string>,
  })
}
