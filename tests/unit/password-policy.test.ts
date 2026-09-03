import { describe, test, expect } from "bun:test"

/**
 * Tests de la politique de mot de passe exigeante (v3.5) :
 * 12 caractères minimum, au moins une majuscule, une minuscule
 * et un caractère spécial — partagée client (UI) et serveur (API register).
 */

import {
  validatePasswordStrength,
  failedRequirements,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-client"
import { hashPassword, verifyPassword } from "@/lib/auth/password"

describe("Politique de mot de passe exigeante", () => {
  test("constante : 12 caractères minimum", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12)
  })

  test("accepte un mot de passe conforme (12+ car., maj, min, spécial)", () => {
    expect(validatePasswordStrength("Secret@Gen3IA1").valid).toBe(true)
    expect(validatePasswordStrength("MotDePasse!2026").valid).toBe(true)
    expect(validatePasswordStrength("abcdefghij!K1").valid).toBe(true)
  })

  test("rejette moins de 12 caractères même complexe", () => {
    const r = validatePasswordStrength("Abcdef1!")
    expect(r.valid).toBe(false)
    expect(r.checks.length).toBe(false)
    expect(r.checks.uppercase).toBe(true)
    expect(r.checks.lowercase).toBe(true)
    expect(r.checks.special).toBe(true)
  })

  test("rejette sans majuscule", () => {
    expect(validatePasswordStrength("motdepasse!123").checks.uppercase).toBe(false)
    expect(validatePasswordStrength("motdepasse!123").valid).toBe(false)
  })

  test("rejette sans minuscule", () => {
    expect(validatePasswordStrength("MOTDEPASSE!123").checks.lowercase).toBe(false)
    expect(validatePasswordStrength("MOTDEPASSE!123").valid).toBe(false)
  })

  test("rejette sans caractère spécial", () => {
    expect(validatePasswordStrength("MotDePasse1234").checks.special).toBe(false)
    expect(validatePasswordStrength("MotDePasse1234").valid).toBe(false)
  })

  test("rejette les mots de passe vides et triviaux", () => {
    expect(validatePasswordStrength("").valid).toBe(false)
    expect(validatePasswordStrength("password").valid).toBe(false)
    expect(validatePasswordStrength("123456789012").valid).toBe(false)
  })

  test("failedRequirements liste précisément les manques", () => {
    const missing = failedRequirements("abc")
    expect(missing).toContain("au moins 12 caractères")
    expect(missing).toContain("au moins une majuscule")
    expect(missing).toContain("au moins un caractère spécial")
    expect(failedRequirements("MotDePasse!2026")).toHaveLength(0)
  })

  test("hash/verify roundtrip sur un mot de passe conforme", () => {
    const hash = hashPassword("Secret@Gen3IA1")
    expect(hash.startsWith("scrypt$")).toBe(true)
    expect(verifyPassword("Secret@Gen3IA1", hash)).toBe(true)
    expect(verifyPassword("Autre@Gen3IA1", hash)).toBe(false)
  })
})
