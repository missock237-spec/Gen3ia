import { describe, test, expect, beforeAll } from "bun:test"
import { mkdirSync } from "node:fs"
import { queueMode, priorityForPlan, enqueueTaskAdvance, queueDepth, closeQueue } from "@/lib/queue/task-queue"
import { EngineWorkerPool, laneForPlan, getEngineWorkerPool, type PoolLane } from "@/lib/engines/worker-pool"
import { BaseEngine, type EngineContext, type EngineExecution } from "@/lib/engines/sdk"
import { fakeEngineContext, fakeLogger } from "./test-utils"

/**
 * v3.6 — Performance :
 *  1. file BullMQ optionnelle (REDIS_URL) avec repli checkpointing ;
 *  2. pool de workers multi-couloirs (critical/normal/background) avec
 *     isolation des concurrences et backpressure inline ;
 *  3. (cache de plans : voir plan-cache-lru.test.ts)
 */

beforeAll(() => {
  // Aucun Redis dans l'environnement de test → mode repli nominal.
  delete process.env.REDIS_URL
})

describe("File d'attente (adaptateur BullMQ)", () => {
  test("mode off sans REDIS_URL — repli checkpointing", () => {
    expect(queueMode()).toBe("off")
  })

  test("enqueue en mode off retourne direct (jamais d'échec)", async () => {
    const result = await enqueueTaskAdvance("task_x")
    expect(result.disposition).toBe("direct")
    expect(result.reason).toContain("REDIS_URL absent")
  })

  test("profondeur null sans Redis (observabilité honnête)", async () => {
    expect(await queueDepth()).toBeNull()
  })

  test("priorités BullMQ par plan — ENTERPRISE < PRO < FREE, retry pénalisé", () => {
    expect(priorityForPlan("ENTERPRISE")).toBe(1)
    expect(priorityForPlan("PRO")).toBe(5)
    expect(priorityForPlan("FREE")).toBe(10)
    expect(priorityForPlan("ENTERPRISE", true)).toBe(6)
    expect(priorityForPlan("FREE", true)).toBe(15)
  })

  test("closeQueue sans connexion : aucune erreur", async () => {
    await closeQueue()
  })
})

// ---------- Moteur factice à durée contrôlée ----------

class FakeSlowEngine extends BaseEngine<Record<string, never>, { done: string }> {
  readonly name = "BATCH" as const
  readonly description = "Moteur lent de test"
  readonly phase = null
  readonly errorCode = "BATCH_FAILED" as const

  constructor(private readonly ms: number, private readonly onStart?: () => void) {
    super()
  }

  async execute(_input: Record<string, never>, _ctx: EngineContext): Promise<EngineExecution<{ done: string }>> {
    this.onStart?.()
    await new Promise((r) => setTimeout(r, this.ms))
    return { value: { done: "ok" }, tokensIn: 0, tokensOut: 0, durationMs: this.ms, attempts: 1 }
  }
}

describe("Pool de workers multi-couloirs", () => {
  test("laneForPlan : ENTERPRISE → critical, sinon normal", () => {
    expect(laneForPlan("ENTERPRISE")).toBe<PoolLane>("critical")
    expect(laneForPlan("PRO")).toBe<PoolLane>("normal")
    expect(laneForPlan("FREE")).toBe<PoolLane>("normal")
    expect(laneForPlan(null)).toBe<PoolLane>("normal")
  })

  test("exécution nominale via le pool (couloir normal)", async () => {
    const pool = new EngineWorkerPool()
    const engine = new FakeSlowEngine(10)
    const result = await pool.submit(engine, {}, fakeEngineContext(), "normal")
    expect(result.value.done).toBe("ok")
    const status = pool.getStatus()
    expect(status.stats.completed).toBe(1)
    expect(status.stats.executedPooled).toBe(1)
  })

  test("isolation des couloirs : la concurrence background sature SANS bloquer critical", async () => {
    const pool = new EngineWorkerPool({ concurrency: { critical: 2, normal: 4, background: 1 } })
    const running = { background: 0, critical: 0 }

    // Sature le couloir background (concurrence 1) + file d'attente.
    const backgroundJobs = Array.from({ length: 4 }, () =>
      pool.submit(new FakeSlowEngine(60, () => running.background++), {}, fakeEngineContext(), "background")
    )
    // Une tâche critique arrive APRÈS : elle doit passer MALGRÉ la saturation
    // background (concurrences isolées par couloir).
    await new Promise((r) => setTimeout(r, 5))
    const criticalStart = Date.now()
    const critical = await pool.submit(new FakeSlowEngine(10, () => running.critical++), {}, fakeEngineContext(), "critical")
    const criticalLatency = Date.now() - criticalStart

    expect(critical.value.done).toBe("ok")
    expect(criticalLatency).toBeLessThan(200) // pas de famine par le couloir background

    await Promise.all(backgroundJobs)
    expect(running.background).toBe(4)
  })

  test("backpressure : file saturée → exécution inline immédiate (jamais de rejet)", async () => {
    const pool = new EngineWorkerPool({ concurrency: { critical: 1, normal: 1, background: 1 }, maxQueueDepth: 2 })
    // 3 jobs longs saturent couloir + file (concurrence 1 + profondeur 2).
    const slow = Array.from({ length: 3 }, () =>
      pool.submit(new FakeSlowEngine(80), {}, fakeEngineContext(), "normal")
    )
    // Le 4e dépasse la profondeur max → inline direct.
    const inlineStart = Date.now()
    const inline = await pool.submit(new FakeSlowEngine(5), {}, fakeEngineContext(), "normal")
    const inlineLatency = Date.now() - inlineStart

    expect(inline.value.done).toBe("ok")
    expect(inlineLatency).toBeLessThan(60) // exécuté immédiatement, sans file
    const status = pool.getStatus()
    expect(status.stats.executedInline).toBe(1)

    await Promise.all(slow)
  })

  test("statistiques du pool exposées (observabilité admin)", async () => {
    const pool = getEngineWorkerPool()
    await pool.submit(new FakeSlowEngine(5), {}, fakeEngineContext(), "normal")
    const status = pool.getStatus()
    expect(status.concurrency.critical).toBeGreaterThan(0)
    expect(status.concurrency.normal).toBeGreaterThan(0)
    expect(status.concurrency.background).toBeGreaterThan(0)
    expect(status.stats.submitted).toBeGreaterThan(0)
    expect(status.queues).toBeDefined()
  })

  test("les erreurs du moteur remontent (reject) sans casser le pool", async () => {
    const pool = new EngineWorkerPool()
    class ExplodingEngine extends FakeSlowEngine {
      async execute(): Promise<EngineExecution<{ done: string }>> {
        throw new Error("boom moteur")
      }
    }
    const exploding = new ExplodingEngine(0)
    await expect(pool.submit(exploding, {}, fakeEngineContext(), "normal")).rejects.toThrow("boom moteur")
    // Le pool reste utilisable.
    const ok = await pool.submit(new FakeSlowEngine(5), {}, fakeEngineContext(), "normal")
    expect(ok.value.done).toBe("ok")
    expect(pool.getStatus().stats.failed).toBe(1)
  })
})

void fakeLogger
