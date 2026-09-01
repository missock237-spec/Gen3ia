import { describe, test, expect, beforeEach } from "bun:test"
import { checkRateLimit, enforceRateLimit, rateLimitSnapshot, RATE_POLICIES } from "@/lib/security/rate-limit"
import { AppError } from "@/lib/errors"

const g = globalThis as unknown as { gen3iaRateBuckets?: Map<string, unknown> }

describe("rate-limit — token bucket unifié", () => {
  beforeEach(() => {
    g.gen3iaRateBuckets = new Map()
  })

  test("politiques cohérentes", () => {
    for (const policy of Object.values(RATE_POLICIES)) {
      expect(policy.limit).toBeGreaterThan(0)
      expect(policy.windowSeconds).toBeGreaterThan(0)
    }
    expect(RATE_POLICIES.auth.limit).toBe(10)
    expect(RATE_POLICIES.apiKey.limit).toBe(60) // politique historique conservée
  })

  test("autorisé jusqu'à la limite puis bloqué", () => {
    const key = `test-${Math.random()}`
    for (let i = 0; i < RATE_POLICIES.auth.limit; i++) {
      const r = checkRateLimit("auth", key)
      expect(r.allowed).toBe(true)
    }
    const blocked = checkRateLimit("auth", key)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  test("buckets indépendants par identifiant", () => {
    const a = checkRateLimit("auth", "ip-A")
    const b = checkRateLimit("auth", "ip-B")
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
  })

  test("enforceRateLimit lève une AppError 429 avec Retry-After", () => {
    const key = `test-${Math.random()}`
    for (let i = 0; i < RATE_POLICIES.auth.limit; i++) enforceRateLimit("auth", key)
    try {
      enforceRateLimit("auth", key)
      throw new Error("devrait avoir levé")
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const appErr = err as AppError & { retryAfter?: number }
      expect(appErr.code).toBe("RATE_LIMITED")
      expect(appErr.status).toBe(429)
      expect(appErr.retryAfter).toBeGreaterThanOrEqual(1)
    }
  })

  test("snapshot d'inspection exposé", () => {
    checkRateLimit("user", "u1")
    const snap = rateLimitSnapshot()
    expect(Array.isArray(snap)).toBe(true)
  })
})
