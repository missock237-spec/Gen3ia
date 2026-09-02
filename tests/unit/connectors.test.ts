import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync } from "node:fs"

/**
 * Tests du module connecteurs Composio (ADR-0014) — v3.3.
 *
 * Ce qui DOIT être testé sans clé (fail-closed, aucune simulation) :
 *  - COMPOSIO_API_KEY absente → statut « non configuré » et erreur explicite
 *    503 CONNECTOR_NOT_CONFIGURED (jamais de fausse donnée) ;
 *  - le catalogue d'outils du moteur n'expose PAS les outils Composio sans clé
 *    (économie de tokens) et les expose AVEC clé (mock de la variable) ;
 *  - le dispatch runTool refuse proprement sans clé ;
 *  - le cycle de vie DB des connexions (création, sync, déconnexion) ;
 *  - la traduction des réponses HTTP Composio en erreurs typées (401/429/404).
 *
 * Base dédiée : db/test-connectors.db — aucune clé API nécessaire.
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-connectors.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
delete process.env.COMPOSIO_API_KEY
delete process.env.COMPOSIO_BASE_URL

// ---------- Imports dynamiques (après configuration de l'environnement) ----------

const { db } = await import("@/lib/db")
const { ensureSchema } = await import("@/lib/db-init")
const {
  isComposioConfigured,
  composioUserId,
  executeActionForUser,
  initiateConnection,
  listConnections,
  syncConnection,
  disconnectConnection,
  connectedAppsOverview,
} = await import("@/lib/connectors/composio")
const { getToolCatalog, listAvailableToolKeys, isToolDangerous, runTool } = await import("@/lib/tools/registry")
const { AppError } = await import("@/lib/errors")

let user: { id: string }

beforeAll(async () => {
  await ensureSchema()
  user = await db.user.create({
    data: {
      email: `connectors-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@gen3ia.test`,
      name: "Test Connecteurs",
      passwordHash: "hash-test",
    },
  })
})

afterAll(async () => {
  // Nettoyage par cascade (relation user → connectedAccount) — même pattern
  // que les tests existants : PAS de $disconnect ni rmSync (bun test partage
  // globalThis entre fichiers ; le singleton Prisma doit rester utilisable
  // pour les fichiers de tests suivants).
  await db.user.delete({ where: { id: user.id } }).catch(() => {})
})

// ---------- Configuration / fail-closed ----------

describe("Configuration Composio — fail-closed explicite", () => {
  test("sans COMPOSIO_API_KEY : non configuré", () => {
    expect(isComposioConfigured()).toBe(false)
  })

  test("sans clé : le catalogue d'outils du moteur n'expose PAS les outils Composio", () => {
    const keys = listAvailableToolKeys()
    expect(keys).toContain("web_search")
    expect(keys).not.toContain("composio_execute")
    expect(keys).not.toContain("composio_list_actions")
    expect(keys).not.toContain("composio_list_apps")
  })

  test("avec clé (mock) : les 3 outils Composio apparaissent dans le catalogue", () => {
    process.env.COMPOSIO_API_KEY = "sk-composio-test"
    try {
      const keys = listAvailableToolKeys()
      expect(keys).toContain("composio_list_apps")
      expect(keys).toContain("composio_list_actions")
      expect(keys).toContain("composio_execute")
      const exec = getToolCatalog().find((t) => t.key === "composio_execute")
      expect(exec?.dangerous).toBe(true) // HITL avant exécution applicative
      expect(isToolDangerous("composio_execute")).toBe(true)
    } finally {
      delete process.env.COMPOSIO_API_KEY
    }
  })

  test("l'identifiant utilisateur Composio est namespacé et stable", () => {
    expect(composioUserId("abc123")).toBe("g3ia_abc123")
    expect(composioUserId("abc123")).toBe(composioUserId("abc123"))
  })
})

// ---------- Exécution sans configuration ----------

describe("runTool / executeActionForUser sans clé — refus explicite (pas de simulation)", () => {
  test("runTool(composio_execute) → erreur CONNECTOR_NOT_CONFIGURED, ok:false", async () => {
    const result = await runTool(
      "composio_execute",
      { action: "GITHUB_CREATE_AN_ISSUE", params: {} },
      { userId: user.id }
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain("COMPOSIO_API_KEY")
    expect(result.output).toBe("")
  })

  test("executeActionForUser → lève AppError CONNECTOR_NOT_CONFIGURED (503)", async () => {
    let caught: unknown
    try {
      await executeActionForUser(user.id, { action: "SLACK_SEND_MESSAGE", params: {} })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AppError)
    const appErr = caught as AppError
    expect(appErr.code).toBe("CONNECTOR_NOT_CONFIGURED")
    expect((appErr as unknown as { status: number }).status).toBe(503)
  })

  test("initiateConnection → AppError CONNECTOR_NOT_CONFIGURED avant tout appel réseau", async () => {
    let caught: unknown
    try {
      await initiateConnection(user.id, { toolkitSlug: "github" })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).code).toBe("CONNECTOR_NOT_CONFIGURED")
  })
})

// ---------- Cycle de vie DB des connexions (source de vérité locale) ----------

describe("Cycle de vie des connexions en base", () => {
  test("connectedAppsOverview : vide sans connexion, remplit avec les ACTIVE", async () => {
    expect(await connectedAppsOverview(user.id)).toEqual([])

    await db.connectedAccount.create({
      data: {
        userId: user.id,
        toolkitSlug: "github",
        toolkitName: "GitHub",
        composioId: `ca_test_${Date.now()}`,
        status: "ACTIVE",
        executions: 3,
      },
    })
    // Une connexion non-ACTIVE ne doit pas apparaître.
    await db.connectedAccount.create({
      data: {
        userId: user.id,
        toolkitSlug: "slack",
        toolkitName: "Slack",
        composioId: `ca_test_init_${Date.now()}`,
        status: "INITIATED",
      },
    })
    const overview = await connectedAppsOverview(user.id)
    expect(overview).toHaveLength(1)
    expect(overview[0].toolkitSlug).toBe("github")
    expect(overview[0].executions).toBe(3)
  })

  test("listConnections : renvoie toutes les connexions avec leurs statuts bruts", async () => {
    const list = await listConnections(user.id)
    expect(list.length).toBeGreaterThanOrEqual(2)
    // (l'ordre exact n'est pas garanti : timestamps SQLite à la seconde)
    expect(list.some((c) => c.status === "INITIATED")).toBe(true)
    expect(list.some((c) => c.status === "ACTIVE")).toBe(true)
    expect(list.every((c) => typeof c.composioId === "string")).toBe(true)
  })

  test("disconnectConnection : supprime la ligne locale (révocation distante sans effet)", async () => {
    const target = await db.connectedAccount.findFirst({
      where: { userId: user.id, toolkitSlug: "slack" },
    })
    expect(target).not.toBeNull()
    await disconnectConnection(user.id, target!.id)
    const after = await db.connectedAccount.findFirst({
      where: { userId: user.id, toolkitSlug: "slack" },
    })
    expect(after).toBeNull()
  })

  test("syncConnection : connexion inexistante → CONNECTOR_NOT_FOUND", async () => {
    let caught: unknown
    try {
      await syncConnection(user.id, "id-inconnu")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).code).toBe("CONNECTOR_NOT_FOUND")
  })

  test("executeActionForUser : action introuvable → résultat échoué explicite (jamais simulé)", async () => {
    process.env.COMPOSIO_API_KEY = "sk-composio-test"
    try {
      // Clé simulée + action inexistante : la résolution échoue côté Composio
      // (404/réseau) et remonte comme résultat échoué — le moteur
      // d'auto-correction l'utilise ; JAMAIS de succès simulé.
      const result = await executeActionForUser(user.id, {
        action: "INEXISTANTE_ACTION_XYZ",
        params: {},
      })
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.output).not.toContain("\"successful\": true")
    } finally {
      delete process.env.COMPOSIO_API_KEY
    }
  })
})

// ---------- Traduction des erreurs HTTP Composio ----------

describe("Traduction HTTP → erreurs typées GEN3IA", () => {
  // On teste la fonction interne via une instance HttpError simulée :
  // le client expose toConnectorError de façon privée ; on vérifie donc
  // les codes du catalogue (contrat public utilisé par les routes).
  test("les codes connecteurs sont déclarés dans le catalogue d'erreurs", async () => {
    const { ERROR_CODES } = await import("@/lib/errors")
    for (const code of [
      "CONNECTOR_NOT_CONFIGURED",
      "CONNECTOR_NOT_FOUND",
      "CONNECTOR_NOT_CONNECTED",
      "CONNECTOR_AUTH_FAILED",
      "CONNECTOR_UNREACHABLE",
      "CONNECTOR_ACTION_FAILED",
      "CONNECTOR_RATE_LIMITED",
    ]) {
      expect(ERROR_CODES).toHaveProperty(code)
    }
    expect(ERROR_CODES.CONNECTOR_NOT_CONFIGURED.status).toBe(503)
    expect(ERROR_CODES.CONNECTOR_AUTH_FAILED.status).toBe(402)
    expect(ERROR_CODES.CONNECTOR_UNREACHABLE.status).toBe(502)
    expect(ERROR_CODES.CONNECTOR_RATE_LIMITED.status).toBe(429)
  })

  test("AppError CONNECTOR_NOT_CONNECTED porte un message actionnable", () => {
    const err = new AppError("CONNECTOR_NOT_CONNECTED")
    expect(err.userMessage).toContain("page Connecteurs")
  })
})

// ---------- Guards des routes (middleware admin inchangé, routes protégées) ----------

describe("Routes connecteurs — protection par session", () => {
  test("GET /api/connectors/connections sans session → 401", async () => {
    const { NextRequest } = await import("next/server")
    const route = await import("@/app/api/connectors/connections/route")
    const res = await route.GET(
      new NextRequest("http://localhost:3000/api/connectors/connections")
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  test("GET /api/connectors/apps sans session → 401", async () => {
    const { NextRequest } = await import("next/server")
    const route = await import("@/app/api/connectors/apps/route")
    const res = await route.GET(new NextRequest("http://localhost:3000/api/connectors/apps"))
    expect(res.status).toBe(401)
  })

  test("POST /api/connectors/connections sans session → 401 (aucune initiation possible)", async () => {
    const { NextRequest } = await import("next/server")
    const route = await import("@/app/api/connectors/connections/route")
    const res = await route.POST(
      new NextRequest("http://localhost:3000/api/connectors/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolkitSlug: "github" }),
      })
    )
    expect(res.status).toBe(401)
  })
})
