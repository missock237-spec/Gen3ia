/**
 * Worker dédié de la file de tâches GEN3IA (v3.6 — scalabilité).
 *
 * Usage (self-host / VPS / container, Redis requis) :
 *   REDIS_URL=redis://localhost:6379 bun scripts/task-worker.ts
 *
 * - Consomme les jobs "task.advance" de la file BullMQ "gen3ia-tasks" ;
 * - concurrence configurable (QUEUE_CONCURRENCY, défaut 4) ;
 * - priorités BullMQ respectées (ENTERPRISE > PRO > FREE, reprises décalées) ;
 * - arrêt propre sur SIGINT/SIGTERM (fin du job en cours) ;
 * - reprise automatique après crash (jobs persistés + attempts/backoff).
 */

import { Worker, type Job } from "bullmq"
import { advanceTask } from "../src/lib/engines/orchestrator"

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
  console.error("REDIS_URL requis (ex. redis://localhost:6379).")
  process.exit(1)
}

const CONCURRENCY = Math.max(1, Number(process.env.QUEUE_CONCURRENCY ?? 4))
const QUEUE_NAME = "gen3ia-tasks"

const processed = { total: 0, ok: 0, failed: 0 }

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job<{ taskId: string }>) => {
    const { taskId } = job.data
    processed.total++
    try {
      const task = await advanceTask(taskId)
      processed.ok++
      const status = task ? task.status : "(statut inconnu)"
      console.log(`[worker] ✓ ${taskId} → ${status} (priorité ${job.opts.priority ?? "?"})`)
    } catch (err) {
      processed.failed++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[worker] ✗ ${taskId} : ${message}`)
      throw err // BullMQ applique attempts/backoff configurés à l'ajout.
    }
  },
  {
    connection: { url: REDIS_URL },
    concurrency: CONCURRENCY,
    // Traitement des jobs résiliés (priorité la plus haute, plan ENTERPRISE d'abord).
    autorun: true,
  }
)

worker.on("ready", () => {
  console.log(`[worker] prêt — file "${QUEUE_NAME}", concurrence ${CONCURRENCY}, redis ${REDIS_URL.replace(/\/\/.*@/, "//***@")}`)
})
worker.on("failed", (job, err) => {
  if (job) console.error(`[worker] job ${job.id} définitivement échoué : ${err.message}`)
})
worker.on("error", (err) => {
  console.error(`[worker] erreur worker : ${err.message}`)
})

setInterval(() => {
  console.log(`[worker] stats — total ${processed.total} · ok ${processed.ok} · échecs ${processed.failed}`)
}, 60_000).unref()

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} reçu — arrêt propre…`)
  await worker.close()
  process.exit(0)
}
process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
