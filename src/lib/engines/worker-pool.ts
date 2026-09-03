import { logger } from "@/lib/observability/logger"
import type { EngineContext, EngineExecution } from "./sdk"
import type { BaseEngine } from "./sdk"

/**
 * EngineWorkerPool — Pool de workers pour l'auto-scaling des moteurs.
 * Distribue l'exécution de moteurs à des workers parallèles quand la charge augmente.
 */

interface PoolConfig {
  minWorkers: number
  maxWorkers: number
  scaleUpThreshold: number // tâches en queue pour déclencher le scale-up
  scaleDownIdleMs: number // inactivité avant scale-down
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  minWorkers: 1,
  maxWorkers: 4,
  scaleUpThreshold: 3,
  scaleDownIdleMs: 60_000,
}

interface WorkerJob<I, O> {
  engine: BaseEngine<I, O>
  input: I
  ctx: EngineContext
  resolve: (result: EngineExecution<O>) => void
  reject: (error: Error) => void
  enqueuedAt: number
}

/**
 * Worker — File d'attente simple pour exécution parallèle de moteurs.
 * En serverless (Vercel), chaque fonction est déjà isolée ; le pool gère
 * la concurrence intra-requête via Promise.all et le backpressure.
 */
class EngineWorkerPool {
  private config: PoolConfig
  private queue: Array<WorkerJob<any, any>> = []
  private active = 0
  private lastActivity = Date.now()

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config }
  }

  /**
   * Soumet un job au pool.
   */
  async submit<I, O>(
    engine: BaseEngine<I, O>,
    input: I,
    ctx: EngineContext
  ): Promise<EngineExecution<O>> {
    return new Promise((resolve, reject) => {
      this.queue.push({ engine, input, ctx, resolve, reject, enqueuedAt: Date.now() })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.active < this.config.maxWorkers) {
      const job = this.queue.shift()!
      this.active++
      this.lastActivity = Date.now()

      try {
        const result = await job.engine.execute(job.input, job.ctx)
        job.resolve(result)
      } catch (err) {
        job.reject(err as Error)
      } finally {
        this.active--
        if (this.queue.length > 0) this.processQueue()
      }
    }

    // Scale-down si inactif
    if (this.active === 0 && Date.now() - this.lastActivity > this.config.scaleDownIdleMs) {
      logger.info("WorkerPool : scale-down (inactivité)")
    }
  }

  /**
   * Statut du pool.
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeWorkers: this.active,
      maxWorkers: this.config.maxWorkers,
      shouldScaleUp: this.queue.length > this.config.scaleUpThreshold,
    }
  }
}

export const engineWorkerPool = new EngineWorkerPool()
