import { test, expect } from "@playwright/test"

/**
 * E2E v4.1 — interface utilisateur de la mise à jour entreprise.
 *
 * Vérifie en navigateur réel (rendu client) ce que l'E2E HTTP ne peut pas
 * observer (hydratation) :
 *  1. paramètres : sections « Mode vocal » (personas, langue, historique) et
 *     « Outils » (catalogue intégré — mission) ;
 *  2. barre de saisie enrichie : micro vocal, bouton envoyer, bouton
 *     multifonction (connecteurs + fichiers tous types), sélecteur Modèle ;
 *  3. bibliothèque de workflows : cartes catégorisées + épinglage ;
 *  4. page outils : redirection vers /settings#tools.
 *
 * Requis : serveur de dev actif (bun run dev — port 3000) et session
 * (l'helper s'appuie sur le user persisté de journeys.spec si possible,
 * sinon inscription dédiée — mot de passe conforme ≥ 12 caractères).
 */

const STRONG_PASSWORD = "E2e!Gen3ia#2026"

// Session partagée : le fichier d'état est créé AVANT le run par
// scripts/e2e-v41-session.mjs (une seule inscription — limite 5/h/IP) ;
// les 6 tests injectent les mêmes cookies via storageState.
const STATE_FILE = "tests/e2e/.v41-session.json"
test.use({ storageState: STATE_FILE })

test.describe("v4.1 — Mise à jour entreprise (UI)", () => {

  test("paramètres : section Mode vocal complète (personas, langue, historique)", async ({ page }) => {
    await page.goto("/settings#voice")
    // La section Mode vocal se charge après hydratation.
    await expect(page.locator("#voice")).toBeVisible({ timeout: 20_000 })
    await expect(page.locator("#voice")).toContainText(/Mode vocal|Voice mode/i)
    // Personas : carrousel avec pagination (Maple par défaut).
    await expect(page.locator("#voice")).toContainText(/Maple/i)
    // Langue : sélecteur présent.
    await expect(page.locator("#voice select").first()).toBeVisible()
    // Historique de dictée.
    await expect(page.locator("#voice")).toContainText(/Historique de dictée|Dictation history/i)
  })

  test("paramètres : section Outils intégrée (mission page outils → paramètres)", async ({ page }) => {
    await page.goto("/settings#tools")
    await expect(page.locator("#tools")).toBeVisible({ timeout: 20_000 })
    // Le catalogue d'outils rend les catégories du registre réel.
    await expect(page.locator("#tools")).toContainText(/Outils|Tools/i, { timeout: 15_000 })
    // Les outils du registre apparaissent (web_search, terminal…).
    await expect(page.locator("#tools")).toContainText(/terminal/i, { timeout: 15_000 })
    // Accès direct aux connecteurs (300+ apps).
    await expect(page.locator("#tools")).toContainText(/Connecteurs|Connectors/i)
  })

  test("page outils redirige vers les paramètres (section outils)", async ({ page }) => {
    await page.goto("/tools")
    await page.waitForURL(/\/settings/, { timeout: 15_000 })
    expect(page.url()).toContain("/settings")
  })

  test("barre de saisie enrichie : micro, envoi, + multifonction, Modèle (page tâches)", async ({ page }) => {
    await page.goto("/tasks")
    // Zone de saisie avec placeholder.
    const composer = page.locator("textarea").first()
    await expect(composer).toBeVisible({ timeout: 20_000 })

    // Bouton multifonction « + » : menu connecteurs + fichiers tous types.
    await page.getByRole("button", { name: /Joindre|Attach/i }).first().click()
    const menu = page.locator("[data-radix-popper-content-wrapper]").first()
    await expect(menu).toBeVisible({ timeout: 10_000 })
    await expect(menu).toContainText(/Connecteurs|Connectors/i)
    await expect(menu).toContainText(/Fichiers|Files/i)
    await expect(menu).toContainText(/Images/i)
    await expect(menu).toContainText(/Vidéos|Videos/i)
    await expect(menu).toContainText(/Audio/i)

    // Sélecteur « Modèle » (pilule) avec option Automatique.
    const modelPill = page.getByRole("button", { name: /Modèle|Model/i }).first()
    await expect(modelPill).toBeVisible({ timeout: 10_000 })
    await modelPill.click()
    const modelMenu = page.locator("[data-radix-popper-content-wrapper]").first()
    await expect(modelMenu).toBeVisible({ timeout: 10_000 })
    await expect(modelMenu).toContainText(/Automatique|Automatic/i)

    // Micro vocal présent (icône microphone, aria-label).
    await expect(page.getByRole("button", { name: /Micro|Dict|mic/i }).first()).toBeVisible()

    // Bouton envoyer présent (disabled sans texte).
    await expect(page.getByRole("button", { name: /Envoyer|Send|Lancer|Launch/i }).first()).toBeVisible()
  })

  test("bibliothèque de workflows : cartes catégorisées + épinglage persistant", async ({ page }) => {
    await page.goto("/workflows")
    // Le catalogue se charge (≥ 15 workflows).
    await expect(page.locator("h1")).toContainText(/Workflows/i)
    await expect(page.getByText(/Recherche → présentation|Research any topic/i).first()).toBeVisible({ timeout: 20_000 })

    // Épinglage : pin le premier workflow → section Épinglés apparaît.
    const firstPin = page.getByRole("button", { name: /Épingler|Pin/i }).first()
    await firstPin.click()
    await expect(page.getByText(/Épinglés|Pinned/i).first()).toBeVisible({ timeout: 10_000 })

    // Persistance après rechargement.
    await page.reload()
    await expect(page.getByText(/Épinglés|Pinned/i).first()).toBeVisible({ timeout: 20_000 })

    // Désépinglage.
    await page.getByRole("button", { name: /Désépingler|Unpin/i }).first().click()
    await page.reload()
    const pinnedSection = page.getByText(/Épinglés|Pinned/i)
    // La section disparaît quand plus aucune épingle.
    await expect(pinnedSection).toHaveCount(0, { timeout: 20_000 })
  })

  test("chat de l'agent : même barre enrichie (micro + envoi)", async ({ page }) => {
    // Libère le quota d'agents (FREE = 3) : supprime les agents e2e existants.
    const listRes = await page.request.get("/api/agents")
    const listJson = await listRes.json().catch(() => null)
    for (const a of listJson?.agents ?? []) {
      if (String(a.name ?? "").startsWith("E2E")) {
        await page.request.delete(`/api/agents/${a.id}`)
      }
    }

    // Créer un agent minimal puis ouvrir sa console de test.
    await page.goto("/agents/new")
    await page.fill("#name", "E2E V41 Agent")
    await page.fill("#description", "Agent de test v4.1")
    await page.click('button[type="submit"]')
    // La création redirige directement vers la page de détail de l'agent.
    await page.waitForURL(/agents\/(?!new)\w+/, { timeout: 30_000 })
    await page.getByRole("tab", { name: /Test|Console/i }).click()
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("button", { name: /Micro|Dict|mic/i }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /Envoyer|Send/i }).first()).toBeVisible()
  })
})
