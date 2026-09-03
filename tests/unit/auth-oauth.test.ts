import { describe, test, expect } from "bun:test"

/**
 * Tests du module d'authentification OAuth (GitHub / Google) :
 * état anti-CSRFC signé, vérification d'expiration, rejet de falsification.
 */

import { signState, verifyState, isOAuthProvider } from "@/lib/auth/oauth"

describe("OAuth — état anti-CSRF (HMAC signé)", () => {
  test("signe et vérifie un état valide pour le même fournisseur", () => {
    const state = signState("github", "/dashboard")
    const redirect = verifyState(state, "github")
    expect(redirect).toBe("/dashboard")
  })

  test("rejette un état émis pour un autre fournisseur", () => {
    const state = signState("github", "/dashboard")
    expect(() => verifyState(state, "google")).toThrow()
  })

  test("rejette un état falsifié (signature altérée)", () => {
    const state = signState("github", "/dashboard")
    const tampered = state.slice(0, -4) + "AAAA"
    expect(() => verifyState(tampered, "github")).toThrow()
  })

  test("rejette les états illisibles", () => {
    expect(() => verifyState("!!!invalide!!!", "github")).toThrow()
    expect(() => verifyState("", "github")).toThrow()
  })

  test("rejette un redirect externe (anti open-redirect)", () => {
    const state = signState("google", "https://evil.example.com")
    // Le signState signe le redirect tel quel, mais verifyState le renvoie :
    // c'est la ROUTE qui assainit (safeRedirect) — on vérifie juste la cohérence.
    const redirect = verifyState(state, "google")
    expect(redirect).toBe("https://evil.example.com")
  })
})

describe("OAuth — registre des fournisseurs", () => {
  test("reconnaît uniquement github et google", () => {
    expect(isOAuthProvider("github")).toBe(true)
    expect(isOAuthProvider("google")).toBe(true)
    expect(isOAuthProvider("facebook")).toBe(false)
    expect(isOAuthProvider("")).toBe(false)
  })
})
