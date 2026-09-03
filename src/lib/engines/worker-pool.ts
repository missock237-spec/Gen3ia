import { logger } from "@/lib/observability/logger"
import type { EngineContext, EngineExecution } from "./sdk"
import type { BaseEngine } from "./sdk"

/**
 * EngineWorkerPool — Pool de workers multi-couloirs (v3.6 — performance).
 *
 * Vocation : exécuter les moteurs LOURDS (LLM, RAG) avec une concurrence
 * bornée PAR COULOIR de priorité, en préservant le thread principal de
 * l'API pour les réponses rapides :
 *
 *  - couloir « critical »  : plans ENTERPRISE, reprises post-panne ;
 *  - couloir « normal »    : trafic standard (PRO/FREE) ;
 *  - couloir « background »: batch, exploration, finetune, drainage.
 *
 * Chaque couloir a sa propre concurrence (variables POOL_*_CONCURRENCY) —
 * un pic de trafic background ne peut donc JAMAIS affamer les requêtes
 * interactives (isolation des couloirs, pas seulement un compteur global).
 *
 * Backpressure : si la file dépasse POOL_MAX_QUEUE_DEPTH, le job est
 * exécuté INLINE (comportement historique direct) — jamais de rejet,
 * jamais de famine.
 *
 * En serverless (Vercel sans REDIS_URL), chaque instance est isolée : le
 * pool borne la concurrence intra-instance ; avec la file BullMQ
 * (cf. src/lib/queue/task-queue.ts), la montée en charge horizontale se
 * fait par les workers dédiés (scripts/task-worker.ts).
 */

export type PoolLane = "critical" | "normal" | "background"

interface PoolConfig {
  /** Concurrence par couloir (bornée par couloir, pas globalement). */
  concurrency: Record<PoolLane, number>
  /** Profondeur max de file avant exécution inline (backpressure). */
  maxQueueDepth: number
  /** Inactivité avant scale-down logique (secondes). */
  scaleDownIdleSec: number
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  concurrency: {
    critical: Math.max(2, Number(process.env.POOL_CRITICAL_CONCURRENCY ?? 4)),
    normal: Math.max(2, Number(process.env.POOL_NORMAL_CONCURRENCY ?? 8)),
    background: Math.max(1, Number(process.env.POOL_BACKGROUND_CONCURRENCY ?? 2)),
  },
  maxQueueDepth: Math.max(10, Number(process.env.POOL_MAX_QUEUE_DEPTH ?? 100)),
  scaleDownIdleSec: 60,
}

interface WorkerJob<I, O> {
  engine: BaseEngine<I, O>
  input: I
  ctx: EngineContext
  lane: PoolLane
  resolve: (result: EngineExecution<O>) => void
  reject: (error: Error) => void
  enqueuedAt: number
}

const g = globalThis as unknown as { gen3iaEnginePool?: EngineWorkerPool }

export class EngineWorkerPool {
  private config: PoolConfig
  private queues: Record<PoolLane, Array<WorkerJob<any, any>>>
  private active: Record<PoolLane, number>
  private stats: {
    submitted: number
    executedPooled: number
    executedInline: number
    completed: number
    failed: number
    lastActivityAt: number
  }

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config }
    if (this.config.concurrency.critical === undefined) this.config.concurrency.critical = 4
    this.queues = { critical: [], normal: [], background: [] }
    this.active = { critical: 0, normal: 0, background: 0 }
    this.stats = {
      submitted: 0,
      executedPooled: 0,
      executedInline: 0,
      completed: 0,
      failed: 0,
      lastActivityAt: Date.now(),
    }
  }

  /**
   * Soumet un moteur au pool, dans son couloir de priorité.
   * Backpressure : file saturée → exécution inline immédiate (jamais de rejet).
   */
  async submit<I, O>(
    engine: BaseEngine<I, O>,
    input: I,
    ctx: EngineContext,
    lane: PoolLane = "normal"
  ): Promise<EngineExecution<O>> {
    this.stats.submitted++
    const totalQueued = this.queues.critical.length + this.queues.normal.length + this.queues.background.length
    if (totalQueued >= this.config.maxQueueDepth) {
      this.stats.executedInline++
      logger.warn("worker-pool: file saturée — exécution inline (backpressure)", {
        lane,
        queued: totalQueued,
        maxQueueDepth: this.config.maxQueueDepth,
      })
      return engine.execute(input, ctx)
    }

    return new Promise<EngineExecution<O>>((resolve, reject) => {
      this.queues[lane].push({ engine, input, ctx, lane, resolve, reject, enqueuedAt: Date.now() })
      this.drain()
    })
  }

  /** Boucle de drainage : consomme les couloirs par ordre de priorité. */
  private drain(): void {
    // Priorité stricte : critical d'abord, puis normal, puis background —
    // chaque couloir ne consomme QUE sa propre concurrence (isolation).
    for (const lane of ["critical", "normal", "background"] as const) {
      const queue = this.queues[lane]
      while (queue.length > 0 && this.active[lane] < this.config.concurrency[lane]) {
        const job = queue.shift()!
        this.active[lane]++
        this.stats.executedPooled++
        this.stats.lastActivityAt = Date.now()
        void this.runJob(job)
      }
    }
    if (this.active.critical + this.active.normal + this.active.background === 0) {
      const idleMs = Date.now() - this.stats.lastActivityAt
      if (idleMs > this.config.scaleDownIdleSec * 1000 && this.stats.executedPooled > 0) {
        logger.debug("worker-pool: inactif (scale-down logique)", { idleSec: Math.round(idleMs / 1000) })
      }
    }
  }

  private async runJob(job: WorkerJob<any, any>): Promise<void> {
    try {
      const result = await job.engine.execute(job.input, job.ctx)
      this.stats.completed++
      job.resolve(result)
    } catch (err) {
      this.stats.failed++
      job.reject(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.active[job.lane]--
      this.drain()
    }
  }

  /** Statistiques d'observabilité (exposées à l'admin). */
  getStatus() {
    const queueLengths = {
      critical: this.queues.critical.length,
      normal: this.queues.normal.length,
      background: this.queues.background.length,
    }
    const waitMs = [...this.queues.critical, ...this.queues.normal, ...this.queues.background].map((j) => Date.now() - j.enqueuedAt)
    return {
      queues: queueLengths,
      active: { ...this.active },
      concurrency: this.config.concurrency,
      maxQueueDepth: this.config.maxQueueDepth,
      shouldScaleUp: queueLengths.critical + queueLengths.normal + queueLengths.background > 0,
      maxWaitMs: waitMs.length > 0 ? Math.max(...waitMs) : 0,
      stats: { ...this.stats },
    }
  }
}

/** Pool partagé (une instance par processus — serverless : par instance). */
export function getEngineWorkerPool(): EngineWorkerPool {
  if (!g.gen3iaEnginePool) g.gen3iaEnginePool = new EngineWorkerPool()
  return g.gen3iaEnginePool
}

/** Instance exportée pour compat avec l'existant. */
export const engineWorkerPool = new Proxy({} as EngineWorkerPool, {
  get(_target, prop, receiver) {
    return Reflect.get(getEngineWorkerPool(), prop, receiver)
  },
})

/** Couloir par défaut selon le plan du propriétaire de la tâche. */
export function laneForPlan(plan: string | undefined | null): PoolLane {
  if (plan === "ENTERPRISE") return "critical"
  return "normal"
}
