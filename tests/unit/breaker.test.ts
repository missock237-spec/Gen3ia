import { describe, test, expect, beforeEach } from "bun:test"
import {
  CircuitBreaker,
  getBreaker,
  resetBreakers,
  snapshotBreakers,
  backoffDelayMs,
  totalRetryBudgetExceeded,
  MAX_TOTAL_RETRIES_PER_TASK,
} from "@/lib/reliability/breaker"

describe("circuit breaker — fiabilité des dépendances", () => {
  beforeEach(() => {
    resetBreakers()
  })

  test("CLOSED → OPEN après le seuil d'échecs", () => {
    const b = new CircuitBreaker("tool:test")
    for (let i = 0; i < 5; i++) b.recordFailure("échec")
    const status = b.status()
    expect(status.state).toBe("OPEN")
    expect(status.failures).toBe(5)
    expect(b.canCall()).toBe(false)
  })

  test("OPEN → HALF_OPEN après le cooldown", async () => {
    const b = new CircuitBreaker("tool:fast", { failureThreshold: 2, windowMs: 60_000, cooldownMs: 10 })
    b.recordFailure("a")
    b.recordFailure("b")
    expect(b.status().state).toBe("OPEN")
    await new Promise((r) => setTimeout(r, 30))
    expect(b.status().state).toBe("HALF_OPEN")
  })

  test("succès en HALF_OPEN → reset complet", async () => {
    const b = new CircuitBreaker("tool:reset", { failureThreshold: 1, windowMs: 60_000, cooldownMs: 10 })
    b.recordFailure("x")
    await new Promise((r) => setTimeout(r, 15))
    expect(b.status().state).toBe("HALF_OPEN")
    b.recordSuccess()
    expect(b.status().state).toBe("CLOSED")
    expect(b.status().failures).toBe(0)
  })

  test("guard lève RETRY_BUDGET_EXCEEDED quand ouvert", () => {
    const b = new CircuitBreaker("tool:guard")
    for (let i = 0; i < 5; i++) b.recordFailure("f")
    try {
      b.guard()
      throw new Error("devrait avoir levé")
    } catch (err) {
      const e = err as { code?: string; context?: { breaker?: string } }
      expect(e.code).toBe("RETRY_BUDGET_EXCEEDED")
      expect(e.context?.breaker).toBe("tool:guard")
    }
  })

  test("fenêtre glissante : vieux échecs expirés", async () => {
    const b = new CircuitBreaker("tool:window", { failureThreshold: 3, windowMs: 5, cooldownMs: 10_000 })
    b.recordFailure("vieux")
    await new Promise((r) => setTimeout(r, 10))
    b.recordFailure("récent")
    expect(b.status().failures).toBe(1)
    expect(b.status().state).toBe("CLOSED")
  })

  test("getBreaker retourne la même instance (registre)", () => {
    expect(getBreaker("tool:same")).toBe(getBreaker("tool:same"))
  })

  test("snapshot expose l'état global", () => {
    const b = getBreaker("tool:snap")
    b.recordFailure("f")
    expect(snapshotBreakers().find((s) => s.key === "tool:snap")).toBeDefined()
  })

  test("run() enregistre succès et échec automatiquement", async () => {
    const b = new CircuitBreaker("tool:run")
    await b.run(async () => 42)
    expect(b.status().state).toBe("CLOSED")
    let threw = false
    try {
      await b.run(async () => {
        throw new Error("boom")
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    expect(b.status().failures).toBe(1)
  })
})

describe("backoff exponentiel avec jitter", () => {
  test("croissance bornée par maxMs", () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = backoffDelayMs(attempt, { baseMs: 1000, maxMs: 5000 })
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(5000)
    }
  })

  test("jitter présent (valeurs variées)", () => {
    const values = new Set<number>()
    for (let i = 0; i < 20; i++) values.add(backoffDelayMs(4, { baseMs: 2000, maxMs: 16_000 }))
    expect(values.size).toBeGreaterThan(1)
  })

  test("budget global de tâche", () => {
    expect(MAX_TOTAL_RETRIES_PER_TASK).toBe(8)
    expect(totalRetryBudgetExceeded(7)).toBe(false)
    expect(totalRetryBudgetExceeded(8)).toBe(true)
  })
})
