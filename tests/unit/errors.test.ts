import { describe, test, expect } from "bun:test"
import { AppError, toAppError, ERROR_CODES } from "@/lib/errors"

/** Catalogue d'erreurs centralisé — codes, statuts, rejouabilité. */
describe("errors — catalogue centralisé", () => {
  test("chaque code possède statut HTTP et message", () => {
    for (const [code, spec] of Object.entries(ERROR_CODES)) {
      expect(spec.status).toBeGreaterThanOrEqual(400)
      expect(spec.status).toBeLessThan(600)
      expect(spec.message.length).toBeGreaterThan(5)
      expect(typeof spec.retryable).toBe("boolean")
    }
  })

  test("codes métier clés présents", () => {
    expect(ERROR_CODES.PLANNING_FAILED.status).toBe(500)
    expect(ERROR_CODES.INSUFFICIENT_CREDITS.status).toBe(402)
    expect(ERROR_CODES.RATE_LIMITED.status).toBe(429)
    expect(ERROR_CODES.SANDBOX_VIOLATION.status).toBe(400)
  })

  test("AppError porte code, statut et contexte", () => {
    const err = new AppError("PLANNING_FAILED", { context: { attempts: 2 } })
    expect(err.code).toBe("PLANNING_FAILED")
    expect(err.status).toBe(500)
    expect(err.retryable).toBe(true)
    expect(err.context).toEqual({ attempts: 2 })
    expect(err.userMessage).toContain("plans")
  })

  test("toAppError convertit les erreurs inconnues sans fuiter le détail", () => {
    const original = new Error("secret interne: path/to/keys")
    const converted = toAppError(original)
    expect(converted.code).toBe("INTERNAL_ERROR")
    expect(converted.userMessage).not.toContain("secret")
    expect(converted.technicalDetail).toContain("secret interne")
  })

  test("toAppError préserve les AppError existantes", () => {
    const appErr = new AppError("AGENT_NOT_FOUND")
    expect(toAppError(appErr)).toBe(appErr)
  })

  test("toJSON/toResponse exposent la forme API standard", () => {
    const err = new AppError("INSUFFICIENT_CREDITS", { message: "Solde insuffisant." })
    expect(err.toJSON()).toEqual({ ok: false, error: "Solde insuffisant.", code: "INSUFFICIENT_CREDITS" })
    const res = err.toResponse()
    expect(res.status).toBe(402)
  })
})
