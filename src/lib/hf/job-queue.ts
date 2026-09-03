import { logger } from "@/lib/observability/logger"

/**
 * File BullMQ dédiée aux HF Jobs (v4.0 — Phase 11/25).
 *
 * Même stratégie de repli que la file de tâches : REDIS_URL présent →
 * BullMQ durable ; absent → "direct" (exécution en requête / reprise par
 * sondage). Priorité par plan utilisateur, dédup par jobId HF.
 */

interface HFQueueHandles {
  queue: import("bullmq").Queue
}

const g = globalThis as unknown as {
  gen3iaHFJobQueue?: HFQueueHandles | null
  gen3iaHFJobQueueConnecting?: Promise<HFQueueHandles | null>
}

async function getHFQueue(): Promise<HFQueueHandles | null> {
  if (g.gen3iaHFJobQueue === null) return null
  if (g.gen3iaHFJobQueue) return g.gen3iaHFJobQueue
  if (!process.env.REDIS_URL?.trim()) {
    g.gen3iaHFJobQueue = null
    return null
  }
  if (g.gen3iaHFJobQueueConnecting) return g.gen3iaHFJobQueueConnecting

  g.gen3iaHFJobQueueConnecting = (async () => {
    try {
      const { Queue } = await import("bullmq")
      const queue = new Queue("gen3ia-hf-jobs", {
        connection: { url: process.env.REDIS_URL },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 10_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 2000 },
        },
      })
      const handles: HFQueueHandles = { queue }
      g.gen3iaHFJobQueue = handles
      logger.info("hf-job-queue: BullMQ connecté", { queue: "gen3ia-hf-jobs" })
      return handles
    } catch (err) {
      g.gen3iaHFJobQueue = null
      logger.warn("hf-job-queue: BullMQ indisponible — exécution directe", {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  })()

  return g.gen3iaHFJobQueueConnecting
}

export interface HFEnqueueResult {
  disposition: "queued" | "direct"
  jobId?: string
  reason?: string
}

export async function enqueueHFJob(
  hfJobId: string,
  options: { isRetry?: boolean; plan?: string } = {}
): Promise<HFEnqueueResult> {
  const queue = await getHFQueue()
  if (!queue) {
    return { disposition: "direct", reason: "REDIS_URL absent — worker en requête" }
  }
  try {
    const priority = options.plan === "ENTERPRISE" ? 1 : options.plan === "PRO" ? 5 : 10
    const job = await queue.queue.add(
      "hfjob.run",
      { hfJobId },
      { jobId: `hfjob:${hfJobId}`, priority: priority + (options.isRetry ? 5 : 0) }
    )
    return { disposition: "queued", jobId: job?.id ?? undefined }
  } catch (err) {
    logger.warn("hf-job-queue: échec d'enregistrement — exécution directe", {
      hfJobId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { disposition: "direct", reason: "échec Redis" }
  }
}

/** Drainage serverless (Vercel Cron) des HF Jobs en attente. */
export async function drainHFJobs(
  max = 5,
  budgetMs = 50_000
): Promise<{ processed: number; ok: number; failed: number; mode: string }> {
  const result = { processed: 0, ok: 0, failed: 0, mode: process.env.REDIS_URL ? "redis" : "off" }
  const queue = await getHFQueue()
  if (!queue) return result
  const { runHFJobWorker, syncNativeHFJobs } = await import("./jobs")
  // 1. Synchronise les jobs HF natifs (polling).
  await syncNativeHFJobs().catch(() => undefined)
  // 2. Traite les jobs GEN3IA locaux.
  const jobs = await queue.queue.getJobs(["waiting", "delayed"], 0, Math.max(max - 1, 0), true)
  const started = Date.now()
  for (const job of jobs) {
    if (Date.now() - started > budgetMs) break
    const hfJobId = (job.data as { hfJobId?: string })?.hfJobId
    if (!hfJobId) {
      await job.remove().catch(() => undefined)
      continue
    }
    result.processed++
    try {
      const view = await runHFJobWorker(hfJobId)
      if (view.status === "COMPLETED") {
        result.ok++
        await job.moveToCompleted("done", "drain").catch(() => job.remove().catch(() => undefined))
      } else {
        // PENDING (retry) ou FAILED : déplace/refail proprement.
        if (view.status === "FAILED") {
          result.failed++
          await job.moveToFailed(new Error(view.error ?? "échec"), "drain").catch(() => undefined)
        } else {
          await job.moveToDelayed(Date.now() + 10_000, "drain").catch(() => job.remove().catch(() => undefined))
        }
      }
    } catch (err) {
      result.failed++
      await job.moveToFailed(err instanceof Error ? err : new Error(String(err)), "drain").catch(() => undefined)
    }
  }
  return result
}

export async function closeHFJobQueue(): Promise<void> {
  const handles = g.gen3iaHFJobQueue
  if (!handles) return
  await handles.queue.close().catch(() => undefined)
  g.gen3iaHFJobQueue = null
  g.gen3iaHFJobQueueConnecting = undefined
}
