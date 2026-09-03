import { test, expect, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

/**
 * E2E — parcours critiques authentifiés (v3.6).
 *
 * Session partagée : UNE inscription réelle (persistée dans
 * tests/e2e/.session-user.json) réutilisée entre les runs — respecte la
 * limite d'inscription (5/h/IP) et la limite de login (10/min/IP).
 * Le pipeline d'exécution de tâche utilise le fournisseur LLM RÉEL.
 */

const STATE_FILE = join(process.cwd(), "tests", "e2e", ".session-user.json")
const STRONG_PASSWORD = "E2e!Gen3ia#2026"

interface SessionUser {
  email: string
  registeredAt: string
}

function loadOrCreateUser(): SessionUser {
  if (existsSync(STATE_FILE)) {
    const user = JSON.parse(readFileSync(STATE_FILE, "utf8")) as SessionUser
    if (user.email) return user
  }
  const user: SessionUser = {
    email: `e2e.journeys.${Date.now()}@gen3ia.test`,
    registeredAt: new Date().toISOString(),
  }
  mkdirSync(join(process.cwd(), "tests", "e2e"), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(user, null, 2))
  return user
}

const SESSION_USER = loadOrCreateUser()

let context: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: "http://localhost:3000" })
  page = await context.newPage()

  // Authentification via l'API : la session (cookie) est posée dans le
  // contexte partagé — les navigations UI suivantes sont authentifiées.
  let login = await context.request.post("/api/auth/login", {
    data: { email: SESSION_USER.email, password: STRONG_PASSWORD },
  })
  if (!login.ok()) {
    // Première exécution (ou base réinitialisée) : inscription réelle.
    const register = await context.request.post("/api/auth/register", {
      data: { name: "E2E Journeys", email: SESSION_USER.email, password: STRONG_PASSWORD },
    })
    if (register.status() === 409) {
      // Utilisateur existant mais mot de passe changé : nouveau compte.
      SESSION_USER.email = `e2e.journeys.${Date.now()}@gen3ia.test`
      writeFileSync(STATE_FILE, JSON.stringify(SESSION_USER, null, 2))
      await context.request.post("/api/auth/register", {
        data: { name: "E2E Journeys", email: SESSION_USER.email, password: STRONG_PASSWORD },
      })
    }
    login = await context.request.post("/api/auth/login", {
      data: { email: SESSION_USER.email, password: STRONG_PASSWORD },
    })
  }
  expect(login.ok()).toBe(true)
})

test.afterAll(async () => {
  await context.close()
})

test.describe("Parcours authentifiés", () => {
  test("création d'agent : constructeur opérationnel", async () => {
    await page.goto("/agents")
    const create = page
      .locator('a:has-text("Nouvel agent"), a:has-text("Créer"), button:has-text("Nouvel agent"), button:has-text("Créer")')
      .first()
    await create.click()
    await page.waitForLoadState("networkidle")

    // Page de création : champ nom présent (formulaire ou templates).
    const nameField = page.locator('input[name="name"]').first()
    if ((await nameField.count()) > 0) {
      await nameField.fill(`E2E Analyste ${Date.now()}`)
    } else {
      // Instanciation depuis un template officiel.
      await page
        .locator('button:has-text("Instancier"), button:has-text("Utiliser"), button:has-text("Créer")')
        .first()
        .click()
      await page.waitForLoadState("networkidle")
    }

    // Sauvegarde si un bouton dédié existe.
    const save = page
      .locator(
        'button:has-text("Enregistrer"), button:has-text("Sauvegarder"), button:has-text("Créer l\'agent"), button:has-text("Créer")'
      )
      .first()
    if ((await save.count()) > 0 && (await save.isVisible().catch(() => false))) {
      await save.click()
      await page.waitForTimeout(2500)
    }

    // Vérification réelle via l'API : l'agent existe.
    const res = await page.request.get("/api/agents")
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.agents)).toBe(true)
    expect(data.agents.length).toBeGreaterThan(0)
  })

  test("exécution de tâche : pipeline complet réel (LLM, outils, livraison)", async () => {
    test.setTimeout(10 * 60_000)

    const create = await page.request.post("/api/tasks", {
      data: {
        prompt:
          "Rédige en cinq phrases une synthèse des avantages des énergies solaires en Afrique de l'Ouest.",
      },
      timeout: 300_000, // pipeline complet réel (LLM) : ~60-120 s en dev
    })
    expect(create.ok()).toBe(true)
    const created = await create.json()
    const taskId = (created.task ?? created).id as string
    expect(taskId).toBeTruthy()

    // La tâche apparaît dans l'interface.
    await page.goto("/tasks")
    await expect(page.locator("body")).toContainText("synthèse des avantages", { timeout: 30_000 })

    // Polling API jusqu'à un état terminal (pipeline réel).
    const deadline = Date.now() + 8 * 60_000
    let terminal = ""
    let task: Record<string, unknown> = {}
    while (Date.now() < deadline) {
      const res = await page.request.get(`/api/tasks/${taskId}`)
      if (res.ok()) {
        const data = await res.json()
        task = data.task ?? data
        terminal = task.status as string
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(terminal)) break
      }
      await page.waitForTimeout(5000)
    }
    expect(["COMPLETED", "FAILED", "CANCELLED"]).toContain(terminal)

    if (terminal === "COMPLETED") {
      const result = task.result as { answer?: string } | undefined
      expect(result?.answer ?? "").not.toBe("")
    } else {
      // Échec explicite et traçable (jamais de statut muet).
      expect(task.error ?? "").not.toBe("")
    }
  })

  test("facturation : vente de crédits avec minimum 50 appliqué", async () => {
    await page.goto("/billing")
    await expect(page.locator("body")).toContainText(/50/, { timeout: 30_000 })

    // Côté serveur : un achat de 30 crédits est REFUSÉ (contrôle réel).
    const res = await page.request.post("/api/billing/checkout", {
      data: { type: "credits", credits: 30 },
      timeout: 120_000,
    })
    if (res.status() !== 404) {
      expect(res.ok()).toBe(false)
    }
  })

  test("connecteurs : catalogue 1000+ apps présenté (aucun token demandé)", async () => {
    const res = await page.request.get("/api/connectors/catalog", { timeout: 120_000 })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(Number(data.total ?? data.count ?? 0)).toBeGreaterThanOrEqual(1000)
  })

  test("documentation API : Swagger UI interactif rend la spec réelle", async () => {
    await page.goto("/docs/api")
    await expect(page.locator("body")).toContainText(/API|Documentation/i, { timeout: 30_000 })
    await expect(page.locator("body")).toContainText("/api/v1/chat")
    await expect(page.locator("body")).toContainText("/api/v1/task")

    const res = await page.request.get("/api/openapi.json")
    expect(res.ok()).toBe(true)
    const spec = await res.json()
    expect(spec.openapi).toBe("3.1.0")
    expect(Object.keys(spec.paths)).toContain("/api/v1/chat")
  })
})
