import { test, expect, type Page } from "@playwright/test"

/**
 * E2E auth — parcours d'inscription et de connexion (v3.6).
 * Validation native navigateur (minLength 12) côté client + politique
 * serveur : une seule inscription réelle par run (limite 5/h/IP).
 */

const unique = Date.now()
const EMAIL = `e2e.auth.${unique}@gen3ia.test`
const STRONG_PASSWORD = "E2e!Gen3ia#2026"

test.describe("Authentification", () => {
  test("inscription refusée : mot de passe faible (validation du navigateur)", async ({ page }) => {
    await page.goto("/register")
    await page.fill("#name", "E2E Auth")
    await page.fill("#email", EMAIL)
    // 11 caractères, sans majuscule ni caractère spécial.
    await page.fill("#password", "motdepasse1")

    // La contrainte HTML minLength={12} bloque la soumission : le
    // navigateur affiche le message de validation, AUCUN appel API part.
    await page.click('button[type="submit"]')
    await page.waitForTimeout(1500)
    await expect(page).not.toHaveURL(/dashboard/)
    // La contrainte server-side complète est couverte par les tests unitaires
    // (password-policy.test.ts : 9 cas) — ici on valide le parcours UI.
    await expect(page.locator("#password")).toHaveValue("motdepasse1")
  })

  test("inscription acceptée : mot de passe conforme, tableau de bord atteint", async ({ page }) => {
    await page.goto("/register")
    await page.fill("#name", "E2E Auth")
    await page.fill("#email", EMAIL)
    await page.fill("#password", STRONG_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 })
    await expect(page.locator("body")).toContainText(/Crédits|credits/i)
  })

  test("connexion : reconnexion avec le même compte", async ({ page }) => {
    await page.goto("/login")
    await page.fill("#email", EMAIL)
    await page.fill("#password", STRONG_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 })
    await expect(page.locator("body")).toContainText(/Crédits|credits/i)
  })
})
