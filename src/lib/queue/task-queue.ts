import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

/**
 * File d'attente persistante des tâches (v3.6 — performance/scalabilité).
 *
 * Deux modes complémentaires, choix automatique :
 *  1. REDIS_URL défini → BullMQ (file DURABLE, priorités par plan, reprise
 *     après redémarrage, worker dédié en self-host : scripts/task-worker.ts,
 *     drainage serverless : POST /api/queue/drain — Vercel Cron) ;
 *  2. REDIS_URL absent → repli sur le checkpointing serverless existant :
 *     l'avancement se fait dans le budget de la requête (POST/GET), déjà
 *     résilient aux crashes (reprise étape par étape).
 *
 * Priorités BullMQ (plus petit = plus prioritaire) :
 *   ENTERPRISE = 1, PRO = 5, FREE = 10, reprises d'échec = priorité +5.
 *
 * Aucune path ne peut échouer à cause de la file : enqueue() retourne
 * "direct" et exécute en cours de requête si Redis/BullMQ est indisponible.
 */

export type QueueMode = "off" | "redis"

export function queueMode(): QueueMode {
  return process.env.REDIS_URL?.trim() ? "redis" : "off"
}

/** Priorité BullMQ selon le plan du propriétaire de la tâche. */
export function priorityForPlan(plan: string, isRetry = false): number {
  const base = plan === "ENTERPRISE" ? 1 : plan === "PRO" ? 5 : 10
  return base + (isRetry ? 5 : 0)
}

interface QueueHandles {
  queue: import("bullmq").Queue
}

const g = globalThis as unknown as {
  gen3iaTaskQueue?: QueueHandles | null
  gen3iaTaskQueueConnecting?: Promise<QueueHandles | null>
}

/** Connexion paresseuse (échec → repli, jamais bloquant). */
async function getQueue(): Promise<QueueHandles | null> {
  if (g.gen3iaTaskQueue === null) return null
  if (g.gen3iaTaskQueue) return g.gen3iaTaskQueue
  if (!process.env.REDIS_URL?.trim()) {
    g.gen3iaTaskQueue = null
    return null
  }
  if (g.gen3iaTaskQueueConnecting) return g.gen3iaTaskQueueConnecting

  g.gen3iaTaskQueueConnecting = (async () => {
    try {
      const { Queue } = await import("bullmq")
      const queue = new Queue("gen3ia-tasks", {
        connection: { url: process.env.REDIS_URL },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 4000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      })
      const handles: QueueHandles = { queue }
      g.gen3iaTaskQueue = handles
      logger.info("queue: BullMQ connecté (REDIS_URL)", { queue: "gen3ia-tasks" })
      return handles
    } catch (err) {
      g.gen3iaTaskQueue = null
      logger.warn("queue: BullMQ indisponible — repli checkpointing en requête", {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  })()

  return g.gen3iaTaskQueueConnecting
}

export interface EnqueueResult {
  disposition: "queued" | "direct"
  jobId?: string
  reason?: string
}

/**
 * Enregistre la poursuite d'une tâche :
 *  - Redis configuré → job durable (priorité plan), exécution asynchrone ;
 *  - sinon → "direct" : l'appelant exécute dans la requête courante
 *    (comportement historique, résilient par checkpointing).
 */
export async function enqueueTaskAdvance(
  taskId: string,
  options: { plan?: string; isRetry?: boolean; delayMs?: number } = {}
): Promise<EnqueueResult> {
  const queue = await getQueue()
  if (!queue) {
    return { disposition: "direct", reason: "REDIS_URL absent — checkpointing en requête" }
  }
  try {
    const job = await queue.queue.add(
      "task.advance",
      { taskId },
      {
        // Dedup : une seule poursuite en attente par tâche (l'ancienne est remplacée).
        jobId: `advance:${taskId}`,
        priority: priorityForPlan(options.plan ?? "FREE", options.isRetry),
        delay: options.delayMs ?? 0,
      }
    )
    return { disposition: "queued", jobId: job?.id ?? undefined }
  } catch (err) {
    logger.warn("queue: échec d'enregistrement — exécution directe", {
      taskId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { disposition: "direct", reason: "échec Redis" }
  }
}

/** Nombre de jobs en attente (observabilité) — null sans Redis. */
export async function queueDepth(): Promise<{ waiting: number; active: number; failed: number } | null> {
  const queue = await getQueue()
  if (!queue) return null
  try {
    const counts = await queue.queue.getJobCounts("waiting", "active", "failed")
    return { waiting: counts.waiting ?? 0, active: counts.active ?? 0, failed: counts.failed ?? 0 }
  } catch {
    return null
  }
}

/**
 * Draine jusqu'à `max` jobs (worker serverless — appelé par Vercel Cron
 * ou POST /api/queue/drain). Budget temps borné (défaut 50 s — marge sous
 * le plafond serverless de 60 s). Retourne à advanceTask le soin de la
 * reprise : les erreurs sont comptées, jamais fatales.
 */
export async function drainQueue(
  max = 10,
  budgetMs = 50_000
): Promise<{ processed: number; ok: number; failed: number; errors: string[]; mode: QueueMode }> {
  const result = { processed: 0, ok: 0, failed: 0, errors: [] as string[], mode: queueMode() }
  const queue = await getQueue()
  if (!queue) return result

  const { advanceTask } = await import("@/lib/engines/orchestrator")
  const jobs = await queue.queue.getJobs(["waiting", "delayed"], 0, Math.max(max - 1, 0), true)
  const started = Date.now()

  for (const job of jobs) {
    if (Date.now() - started > budgetMs) break
    const taskId = (job.data as { taskId?: string })?.taskId
    if (!taskId) {
      await job.remove().catch(() => undefined)
      continue
    }
    result.processed++
    try {
      await advanceTask(taskId)
      result.ok++
      await job.moveToCompleted("done", "drain").catch(() => job.remove().catch(() => undefined))
    } catch (err) {
      result.failed++
      const message = err instanceof Error ? err.message : String(err)
      if (result.errors.length < 10) result.errors.push(`${taskId}: ${message}`)
      await job.moveToFailed(new Error(message), "drain").catch(() => undefined)
    }
  }
  logger.info("queue: drainage terminé", { processed: result.processed, ok: result.ok, failed: result.failed })
  return result
}

/** Clôture propre (tests / arrêt de worker). */
export async function closeQueue(): Promise<void> {
  const handles = g.gen3iaTaskQueue
  if (!handles) return
  await handles.queue.close().catch(() => undefined)
  g.gen3iaTaskQueue = null
  g.gen3iaTaskQueueConnecting = undefined
}
