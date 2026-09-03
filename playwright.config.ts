import { defineConfig, devices } from "@playwright/test"

/**
 * E2E Playwright — parcours utilisateurs critiques (v3.6 — architecture).
 *
 * Exécution : bunx playwright test
 * Prérequis : serveur de dev actif sur http://localhost:3000 (bun run dev).
 * Le pipeline d'exécution de tâche utilise le fournisseur LLM RÉEL
 * configuré (aucun mock) — le test valide le parcours de bout en bout.
 */

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false, // parcours séquentiels (inscription → agent → tâche)
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    locale: "fr-FR",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
