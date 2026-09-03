import { describe, test, expect } from "bun:test"
import {
  buildPendingApproval,
  isApprovalExpired,
  approvalSecondsLeft,
  approvalTtlMs,
  sealDecision,
} from "@/lib/security/hitl"

/**
 * v3.6 — HITL durci : expiration des demandes d'approbation + traçabilité
 * renforcée (approbateur, IP, user-agent).
 */

describe("buildPendingApproval", () => {
  test("porte une échéance calculée depuis le TTL", () => {
    const pending = buildPendingApproval({ reason: "Opération sensible", planId: "P1" })
    expect(pending.reason).toBe("Opération sensible")
    expect(pending.expiresAt).toBeTruthy()
    expect(Date.parse(pending.expiresAt)).toBeGreaterThan(Date.now() - 1000)
    expect(Date.parse(pending.expiresAt)).toBeLessThanOrEqual(Date.now() + approvalTtlMs() + 1000)
  })

  test("l'échéance est relative à askedAt", () => {
    const askedAt = new Date("2026-01-01T00:00:00Z")
    const pending = buildPendingApproval({ reason: "x", askedAt })
    expect(pending.askedAt).toBe(askedAt.toISOString())
    expect(Date.parse(pending.expiresAt)).toBe(askedAt.getTime() + approvalTtlMs())
  })
})

describe("isApprovalExpired (fail-closed)", () => {
  test("non expirée dans le délai", () => {
    const pending = buildPendingApproval({ reason: "x" })
    expect(isApprovalExpired(pending)).toBe(false)
  })

  test("expirée après le délai", () => {
    const pending = buildPendingApproval({ reason: "x", askedAt: new Date(Date.now() - approvalTtlMs() - 1000) })
    expect(isApprovalExpired(pending)).toBe(true)
  })

  test("fail-closed : payload absent / échéance invalide = expirée", () => {
    expect(isApprovalExpired(null)).toBe(true)
    expect(isApprovalExpired({})).toBe(true)
    expect(isApprovalExpired({ expiresAt: "not-a-date" })).toBe(true)
    // Format legacy sans expiresAt (pré-v3.6) : traité comme expiré.
    expect(isApprovalExpired({ askedAt: new Date().toISOString() })).toBe(true)
  })
})

describe("approvalSecondsLeft", () => {
  test("compte à rebours positif", () => {
    const pending = buildPendingApproval({ reason: "x" })
    const left = approvalSecondsLeft(pending)
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThanOrEqual(Math.ceil(approvalTtlMs() / 1000))
  })

  test("0 si expirée", () => {
    const pending = buildPendingApproval({ reason: "x", askedAt: new Date(Date.now() - 2 * approvalTtlMs()) })
    expect(approvalSecondsLeft(pending)).toBe(0)
  })
})

describe("sealDecision — traçabilité", () => {
  test("scelle qui/quand/ip/user-agent dans la décision", () => {
    const pending = buildPendingApproval({ reason: "code_runner", dangerousOperations: ["code_runner"] })
    const sealed = sealDecision(pending, { approved: true, reason: "OK pour exécution" }, {
      decidedBy: "user_123",
      decidedByEmail: "admin@gen3ia.online",
      decidedAt: "2026-01-01T10:00:00Z",
      ip: "41.202.219.7",
      userAgent: "Mozilla/5.0 (GEN3IA test)",
    })
    expect(sealed.approved).toBe(true)
    expect(sealed.decidedBy).toBe("user_123")
    expect(sealed.decidedByEmail).toBe("admin@gen3ia.online")
    expect(sealed.ip).toBe("41.202.219.7")
    expect(sealed.userAgent).toBe("Mozilla/5.0 (GEN3IA test)")
    expect(sealed.reason).toBe("OK pour exécution")
    // La demande d'origine est conservée (audit complet).
    expect(sealed.dangerousOperations).toEqual(["code_runner"])
  })
})
