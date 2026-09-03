import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync } from "node:fs"

// Base dédiée (convention du projet — voir billing-guards.test.ts).
mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-connectors.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`

// Imports dynamiques APRÈS la configuration de l'environnement.
const { db } = await import("@/lib/db")
const { ensureSchema } = await import("@/lib/db-init")
const { encryptJson } = await import("@/lib/connectors/core/crypto")
const { AuthScheme } = await import("@/lib/connectors/core/auth-scheme")
const { runTool } = await import("@/lib/tools/registry")
const { connectorToolsForUser, connectorToolKey } = await import("@/lib/connectors/core/toolset")

/**
 * Intégration agent ↔ connectors : la chaîne complète
 * runTool("connector_<app>_<action>") → ConnectionAccount (chiffré)
 * → buildRequest → fetch (stub serveur) → réponse normalisée.
 *
 * Le stub fetch simule le SERVEUR cible (comme un reverse-proxy de
 * test) — la chaîne GEN3IA reste intégralement réelle.
 */

const TEST_EMAIL = `toolset-test-${Date.now()}@gen3ia.test`
let userId: string
let connectionId: string
let originalFetch: typeof fetch

beforeAll(async () => {
  await ensureSchema()
  const user = await db.user.create({
    data: { email: TEST_EMAIL, passwordHash: "x", credits: 10 },
  })
  userId = user.id
  const conn = await db.connectedAccount.create({
    data: {
      userId,
      appSlug: "github",
      status: "ACTIVE",
      authScheme: "OAUTH2",
      encryptedData: encryptJson(AuthScheme.OAuth2({ access_token: "ghp_integration_test" })),
      meta: JSON.stringify({ scopes: "repo" }),
    },
  })
  connectionId = conn.id
  originalFetch = globalThis.fetch
})

afterAll(async () => {
  globalThis.fetch = originalFetch
  await db.connectedAccount.deleteMany({ where: { userId } })
  await db.user.deleteMany({ where: { id: userId } })
})

describe("connectors/toolset — outils LLM pour agents", () => {
  test("les apps connectées exposent leurs actions comme outils", async () => {
    const tools = await connectorToolsForUser(userId, ["connectors"])
    expect(tools.length).toBeGreaterThan(5)
    const keys = tools.map((t) => t.key)
    expect(keys).toContain("connector_github_get_me")
    expect(keys).toContain("connector_github_create_issue")
    const createIssue = tools.find((t) => t.key === "connector_github_create_issue")
    expect(createIssue?.dangerous).toBe(true) // POST → sensible
    expect(createIssue?.parameters.title?.required).toBe(true)
    const getMe = tools.find((t) => t.key === "connector_github_get_me")
    expect(getMe?.dangerous).toBe(false) // GET → lecture
  })

  test("filtrage par préfixe d'app (connector:github)", async () => {
    const tools = await connectorToolsForUser(userId, ["connector:github"])
    expect(tools.length).toBeGreaterThan(5)
    expect(tools.every((t) => t.key.startsWith("connector_github_"))).toBe(true)
  })

  test("sans autorisation connector → aucune action exposée", async () => {
    const tools = await connectorToolsForUser(userId, ["web_search", "calculator"])
    expect(tools).toEqual([])
  })

  test("autorisation d'une action exacte seule", async () => {
    const tools = await connectorToolsForUser(userId, [
      "web_search",
      connectorToolKey("github", "get_me"),
    ])
    expect(tools.map((t) => t.key)).toEqual(["connector_github_get_me"])
  })
})

describe("connectors/toolset — dispatch runTool (voie agent)", () => {
  test("runTool exécute l'action et renvoie la réponse normalisée", async () => {
    // Stub du serveur GitHub : vérifie la requête réellement construite.
    globalThis.fetch = (async (input: any, init?: any) => {
      expect(String(input)).toBe("https://api.github.com/user")
      expect(init.headers.Authorization).toBe("Bearer ghp_integration_test")
      return new Response(
        JSON.stringify({ login: "agent-runner", id: 99, name: "Agent Runner" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }) as any

    const result = await runTool(
      "connector_github_get_me",
      {},
      { userId, agentId: null }
    )
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    const data = result.data as { login: string }
    expect(data.login).toBe("agent-runner")
    expect(result.output).toContain("agent-runner")
  })

  test("requête POST avec paramètres body correctement sérialisés", async () => {
    let captured: { url: string; method: string; body: string; auth: string } | null = null
    globalThis.fetch = (async (input: any, init?: any) => {
      captured = {
        url: String(input),
        method: init.method,
        body: String(init.body),
        auth: init.headers.Authorization,
      }
      return new Response(JSON.stringify({ number: 7, html_url: "https://github.com/x/y/issues/7" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    }) as any

    const result = await runTool(
      "connector_github_create_issue",
      { owner: "acme", repo: "app", title: "Problème détecté", body: "Détail auto" },
      { userId, agentId: null }
    )
    expect(result.ok).toBe(true)
    expect(captured?.url).toBe("https://api.github.com/repos/acme/app/issues")
    expect(captured?.method).toBe("POST")
    expect(captured?.auth).toBe("Bearer ghp_integration_test")
    const body = JSON.parse(captured?.body ?? "{}")
    expect(body.title).toBe("Problème détecté")
    expect(body.body).toBe("Détail auto")
  })

  test("échec HTTP de l'app cible → ok=false avec erreur (pas de faux succès)", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as any
    const result = await runTool("connector_github_get_me", {}, { userId, agentId: null })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test("clé d'outil invalide → outil inconnu", async () => {
    const result = await runTool("connector_unknownapp_action", {}, { userId, agentId: null })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/inconnu|invalide|Aucune connexion/i)
  })
})
