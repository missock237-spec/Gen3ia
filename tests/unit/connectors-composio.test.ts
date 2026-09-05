import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { mkdirSync } from "node:fs"

// Base dédiée (convention du projet — voir connectors-toolset.test.ts).
mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-composio.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`

// Environnement déterministe : aucune clé Composio au démarrage.
delete process.env.COMPOSIO_API_KEY

// Imports dynamiques APRÈS la configuration de l'environnement.
const { db } = await import("@/lib/db")
const { ensureSchema } = await import("@/lib/db-init")
const { encryptJson } = await import("@/lib/connectors/core/crypto")
const client = await import("@/lib/connectors/composio/client")
const provider = await import("@/lib/connectors/composio/provider")
const { appAvailability, getApp } = await import("@/lib/connectors/apps")
const { getCatalogApp, composioManagedSlugs } = await import("@/lib/connectors/catalog")
const { parseConnectorToolKey, connectorToolKey } = await import("@/lib/connectors/core/types")

/**
 * Intégration Composio hébergée (v4.2) :
 * - résolution de clé (env > base chiffrée, jamais exposée) ;
 * - gestion admin (setComposioKey/clearComposioKey, roundtrip AES-256-GCM) ;
 * - connectivité (ensemble statique composioManaged) et priorité
 *   des modes (OAUTH local > COMPOSIO > TOKEN_IMPORT) ;
 * - vues sanitisées + exécution d'outils (fetch stub serveur, la
 *   chaîne GEN3IA reste intégralement réelle) ;
 * - clés d'outils (parse des slugs Composio majuscules).
 */

const FAKE_KEY = "composio_test_key_0123456789abcdef"
const TEST_EMAIL = `composio-test-${Date.now()}@gen3ia.test`
let userId: string
let originalFetch: typeof fetch

/** Réponse JSON utilitaire. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Compte connecté Composio factice — format WIRE snake_case (v3.1). */
function fakeConnectedAccount() {
  return {
    id: "ca_test123",
    auth_config: { id: "ac_1", is_composio_managed: true, is_disabled: false },
    alias: null,
    data: { access_token: "SECRET_NEVER_RETURNED" },
    status: "ACTIVE",
    status_reason: null,
    toolkit: { slug: "github" },
    is_disabled: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }
}

beforeAll(async () => {
  await ensureSchema()
  // Nettoyage des secrets résiduels d'une exécution précédente.
  await db.platformSecret.deleteMany({ where: { key: "composio" } })
  client.invalidateComposioKeyCache()
  provider.invalidateComposioCaches()

  const user = await db.user.create({
    data: { email: TEST_EMAIL, passwordHash: "x", credits: 10 },
  })
  userId = user.id
  originalFetch = globalThis.fetch
})

afterAll(async () => {
  delete process.env.COMPOSIO_API_KEY
  process.env.GITHUB_CLIENT_ID = ""
  process.env.GITHUB_CLIENT_SECRET = ""
  globalThis.fetch = originalFetch
  client.invalidateComposioKeyCache()
  provider.invalidateComposioCaches()
  await db.platformSecret.deleteMany({ where: { key: "composio" } })
})

// ─────────────────────────────────────────────────────────────
// Client : résolution et gestion de la clé
// ─────────────────────────────────────────────────────────────

describe("composio/client — résolution de la clé API", () => {
  test("identifiant utilisateur mappé avec préfixe explicite", () => {
    expect(client.composioUserId("abc123")).toBe("gen3ia-u-abc123")
  })

  test("sans env ni base → non configurée", async () => {
    delete process.env.COMPOSIO_API_KEY
    client.invalidateComposioKeyCache()
    const resolved = await client.resolveComposioKey()
    expect(resolved.key).toBeNull()
    expect(resolved.source).toBeNull()
    expect(await client.isComposioConfigured()).toBe(false)
  })

  test("l'environnement est prioritaire sur la base", async () => {
    await client.setComposioKey("db_fallback_key_0123456789", "admin-test")
    process.env.COMPOSIO_API_KEY = FAKE_KEY
    client.invalidateComposioKeyCache()
    const resolved = await client.resolveComposioKey()
    expect(resolved.source).toBe("env")
    expect(resolved.key).toBe(FAKE_KEY)
    delete process.env.COMPOSIO_API_KEY
    client.invalidateComposioKeyCache()
  })

  test("repli base : clé chiffrée AES-256-GCM relue en clair côté serveur", async () => {
    delete process.env.COMPOSIO_API_KEY
    client.invalidateComposioKeyCache()
    const resolved = await client.resolveComposioKey()
    expect(resolved.source).toBe("db")
    expect(resolved.key).toBe("db_fallback_key_0123456789")
  })

  test("la clé stockée n'est JAMAIS en clair en base", async () => {
    const row = await db.platformSecret.findUnique({ where: { key: "composio" } })
    expect(row).not.toBeNull()
    expect(row!.encryptedValue).not.toContain("db_fallback_key_0123456789")
    expect(row!.encryptedValue.length).toBeGreaterThan(20)
  })

  test("clé stockée trop courte → ignorée (non configurée)", async () => {
    await db.platformSecret.update({
      where: { key: "composio" },
      data: { encryptedValue: encryptJson({ apiKey: "short" }) },
    })
    client.invalidateComposioKeyCache()
    const resolved = await client.resolveComposioKey()
    expect(resolved.key).toBeNull()
  })

  test("setComposioKey rejette une clé trop courte", async () => {
    await expect(client.setComposioKey("abc", "admin")).rejects.toThrow()
  })

  test("setComposioKey → clearComposioKey : roundtrip complet", async () => {
    await client.setComposioKey(FAKE_KEY, "admin-test")
    expect(await client.isComposioConfigured()).toBe(true)
    const removed = await client.clearComposioKey()
    expect(removed).toBe(true)
    client.invalidateComposioKeyCache()
    expect(await client.isComposioConfigured()).toBe(false)
    // clearComposioKey est idempotent sur une base vide.
    expect(await client.clearComposioKey()).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Connectivité : catalogue statique + priorité des modes
// ─────────────────────────────────────────────────────────────

describe("composio/provider — connectivité", () => {
  test("l'ensemble statique composioManaged est cohérent avec le catalogue", () => {
    const managed = composioManagedSlugs()
    expect(managed.size).toBeGreaterThan(100)
    const airtable = getCatalogApp("airtable")
    expect(airtable?.composioManaged.length ?? 0).toBeGreaterThan(0)
    expect(managed.has("airtable")).toBe(true)
    expect(managed.has("unknown-app-xyz")).toBe(false)
  })

  test("composioConnectable : vrai pour une app managée, faux sinon", () => {
    expect(provider.composioConnectable("airtable")).toBe(true)
    expect(provider.composioConnectable("unknown-app-xyz")).toBe(false)
  })

  test("statut global : non configurée sans clé", async () => {
    const status = await provider.composioStatus()
    expect(status.configured).toBe(false)
    expect(status.toolkitCount).toBe(0)
  })
})

describe("composio/availability — priorité des modes", () => {
  test("sans clé Composio : jamais de mode COMPOSIO", () => {
    const airtable = getApp("airtable")
    expect(airtable).not.toBeNull()
    const availability = appAvailability(airtable!, { composioEnabled: false })
    expect(availability.mode).not.toBe("COMPOSIO")
  })

  test("avec clé Composio : app managée sans OAuth local → COMPOSIO (1 clic)", () => {
    const airtable = getApp("airtable")
    const availability = appAvailability(airtable!, { composioEnabled: true })
    expect(availability.mode).toBe("COMPOSIO")
    expect(availability.connectable).toBe(true)
    expect(availability.requiredEnvVars).toEqual([])
  })

  test("OAuth local préconfiguré → OAUTH prioritaire sur COMPOSIO", () => {
    process.env.GITHUB_CLIENT_ID = "test_client_id"
    process.env.GITHUB_CLIENT_SECRET = "test_client_secret"
    try {
      const github = getApp("github")
      const availability = appAvailability(github!, { composioEnabled: true })
      expect(availability.mode).toBe("OAUTH")
      expect(availability.envConfigured).toBe(true)
    } finally {
      delete process.env.GITHUB_CLIENT_ID
      delete process.env.GITHUB_CLIENT_SECRET
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Provider : vues sanitisées + exécution (serveur stub)
// ─────────────────────────────────────────────────────────────

describe("composio/provider — connexions et exécution (fetch stub)", () => {
  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = FAKE_KEY
    client.invalidateComposioKeyCache()
    provider.invalidateComposioCaches()

    // Serveur stub : routing par chemin réel de l'API Composio v3.1
    // (formats WIRE snake_case, identiques à la plateforme réelle).
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/v3.1/connected_accounts")) {
        return jsonResponse({
          items: [fakeConnectedAccount()],
          next_cursor: null,
          total_pages: 1,
        })
      }
      if (url.includes("/api/v3.1/tools/execute/")) {
        return jsonResponse({
          data: { created: true, number: 42 },
          error: null,
          successful: true,
          log_id: "log_1",
        })
      }
      // GET d'un outil individuel (pré-exécution) : /api/v3.1/tools/{slug}
      if (/\/api\/v3\.1\/tools\/[^/]+$/.test(url)) {
        return jsonResponse({
          slug: "GITHUB_CREATE_ISSUE",
          name: "Create Issue",
          description: "Create a GitHub issue",
          toolkit: { slug: "github", name: "GitHub" },
          available_versions: ["20250901_00", "20250909_00"],
          input_parameters: {
            type: "object",
            properties: {
              owner: { type: "string", description: "Repo owner" },
              repo: { type: "string", description: "Repo name" },
            },
            required: ["owner", "repo"],
          },
        })
      }
      if (url.includes("/api/v3.1/tools")) {
        return jsonResponse({
          items: [
            {
              slug: "GITHUB_CREATE_ISSUE",
              name: "Create Issue",
              description: "Create a GitHub issue",
              toolkit: { slug: "github", name: "GitHub" },
              available_versions: ["20250901_00", "20250909_00"],
              input_parameters: {
                type: "object",
                properties: {
                  owner: { type: "string", description: "Repo owner" },
                  repo: { type: "string", description: "Repo name" },
                },
                required: ["owner", "repo"],
              },
            },
          ],
        })
      }
      if (url.includes("/api/v3.1/toolkits")) {
        return jsonResponse({
          items: [
            {
              name: "GitHub",
              slug: "github",
              meta: {
                categories: [{ id: "dev", name: "Developer Tools" }],
                created_at: "2026-01-01T00:00:00.000Z",
                description: "GitHub toolkit",
                logo: "https://logo.com/github.png",
                tools_count: 70,
                triggers_count: 10,
                updated_at: "2026-01-01T00:00:00.000Z",
              },
              is_local_toolkit: false,
              auth_schemes: ["OAUTH2"],
              composio_managed_auth_schemes: ["OAUTH2"],
            },
          ],
        })
      }
      return jsonResponse({ error: "Not Found" }, 404)
    }) as typeof fetch
  })

  test("listComposioConnections : vue sanitisée (id cpc_, aucun secret)", async () => {
    const views = await provider.listComposioConnections(userId)
    expect(views.length).toBe(1)
    const view = views[0]
    expect(view.id).toBe("cpc_ca_test123")
    expect(view.appSlug).toBe("github")
    expect(view.active).toBe(true)
    expect(view.status).toBe("ACTIVE")
    // Le secret du serveur stub ne doit JAMAIS traverser.
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain("SECRET_NEVER_RETURNED")
    expect(serialized).not.toContain("access_token")
  })

  test("getActiveComposioConnection : résout la connexion active", async () => {
    const conn = await provider.getActiveComposioConnection(userId, "github")
    expect(conn).not.toBeNull()
    expect(conn!.appSlug).toBe("github")
    const none = await provider.getActiveComposioConnection(userId, "slack")
    expect(none).toBeNull()
  })

  test("executeComposioAction : réponse normalisée (ok, data, connectionId)", async () => {
    const result = await provider.executeComposioAction({
      userId,
      appSlug: "github",
      actionSlug: "GITHUB_CREATE_ISSUE",
      params: { owner: "gen3ia", repo: "app" },
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.connectionId).toBe("cpc_ca_test123")
    expect(result.appSlug).toBe("github")
    expect(result.actionSlug).toBe("GITHUB_CREATE_ISSUE")
    expect(JSON.stringify(result.data)).toContain("42")
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  test("executeComposioAction sans connexion → erreur explicite", async () => {
    // Le stub ne renvoie que github : slack n'a pas de connexion.
    await expect(
      provider.executeComposioAction({
        userId,
        appSlug: "slack",
        actionSlug: "SLACK_SEND_MESSAGE",
        params: {},
      })
    ).rejects.toThrow(/Aucune connexion Composio active/)
  })

  test("composioToolsForUser : outils convertis au format registre GEN3IA", async () => {
    const tools = await provider.composioToolsForUser(userId, ["connectors"], new Set())
    expect(tools.length).toBe(1)
    const tool = tools[0]
    expect(tool.key).toBe("connector_github_GITHUB_CREATE_ISSUE")
    expect(tool.parameters.owner).toBeDefined()
    expect(tool.parameters.owner.required).toBe(true)
    // CREATE est une mutation → marquée sensible.
    expect(tool.dangerous).toBe(true)
    expect(tool.description).toContain("Composio")
  })

  test("composioToolsForUser : exclusion anti-doublon des apps locales", async () => {
    const tools = await provider.composioToolsForUser(userId, ["connectors"], new Set(["github"]))
    expect(tools.length).toBe(0)
  })

  test("composioToolsForUser : filtrage par allowedTools", async () => {
    const tools = await provider.composioToolsForUser(userId, ["connector_github"], new Set())
    expect(tools.length).toBe(1)
    const none = await provider.composioToolsForUser(userId, ["connector_notion"], new Set())
    expect(none.length).toBe(0)
  })

  test("deleteComposioConnection : vérifie l'appartenance puis supprime", async () => {
    const ok = await provider.deleteComposioConnection(userId, "cpc_ca_test123")
    expect(ok).toBe(true)
    // La connexion n'apparaît plus (le stub la renvoie, mais le cache
    // utilisateur est invalidé ET la suppression passe par le stub 200…
    // le stub renvoie toujours la connexion : on vérifie surtout le
    // rejet d'un id n'appartenant pas à l'utilisateur).
    const foreign = await provider.deleteComposioConnection(userId, "cpc_other456")
    expect(foreign).toBe(false)
    expect(await provider.deleteComposioConnection(userId, "local-id")).toBe(false)
  })

  test("composioStatus : configurée, comptage live depuis le stub", async () => {
    const status = await provider.composioStatus()
    expect(status.configured).toBe(true)
    expect(status.source).toBe("env")
    expect(status.toolkitSource).toBe("live")
    expect(status.toolkitCount).toBe(1) // le stub ne déclare que github
  })
})

// ─────────────────────────────────────────────────────────────
// Clés d'outils : slugs Composio (majuscules)
// ─────────────────────────────────────────────────────────────

describe("composio/toolkeys — slugs Composio", () => {
  test("roundtrip connector_<app>_<TOOL_SLUG>", () => {
    const key = connectorToolKey("github", "GITHUB_CREATE_ISSUE")
    expect(key).toBe("connector_github_GITHUB_CREATE_ISSUE")
    const parsed = parseConnectorToolKey(key)
    expect(parsed).toEqual({ appSlug: "github", actionSlug: "GITHUB_CREATE_ISSUE" })
  })
})
