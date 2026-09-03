import { describe, test, expect } from "bun:test"

/**
 * Tests du catalogue d'applications (1467 apps Composio) :
 * recherche, pagination, détail des outils, connectivité,
 * et du parseur OpenAPI → actions exécutables.
 */

import {
  searchCatalog,
  catalogStats,
  getCatalogApp,
  getCatalogTools,
  mapCategory,
  mapAuthScheme,
} from "@/lib/connectors/catalog"
import { OAUTH_ENDPOINTS, getOAuthEndpoints } from "@/lib/connectors/catalog/endpoints"
import { parseOpenApi, tryParseSpec } from "@/lib/connectors/catalog/openapi-parser"

describe("Catalogue d'applications (données Composio réelles)", () => {
  test("contient 1467 applications avec leurs métadonnées", () => {
    const stats = catalogStats()
    expect(stats.apps).toBe(1467)
    expect(stats.tools).toBe(51240)
    expect(stats.categories.length).toBeGreaterThan(50)
  })

  test("les apps majeures sont présentes avec leurs outils", () => {
    for (const slug of ["github", "slack", "gmail", "notion", "jira", "linear", "airtable"]) {
      const app = getCatalogApp(slug)
      expect(app, `app ${slug}`).not.toBeNull()
      expect(app!.toolCount).toBeGreaterThan(0)
    }
    const gmail = getCatalogTools("gmail")
    expect(gmail.tools.length).toBeGreaterThan(10)
    expect(gmail.tools[0].slug).toMatch(/^GMAIL_/)
  })

  test("la recherche filtre par nom, slug et description", () => {
    const r1 = searchCatalog({ search: "slack" })
    expect(r1.total).toBeGreaterThan(0)
    expect(r1.apps.some((a) => a.slug === "slack")).toBe(true)

    const r2 = searchCatalog({ search: "slack", category: "communication" })
    expect(r2.apps.every((a) => a.category === "communication")).toBe(true)
    expect(r2.total).toBeLessThanOrEqual(r1.total)
  })

  test("la pagination est cohérente et bornée", () => {
    const r = searchCatalog({ page: 1, pageSize: 24 })
    expect(r.page).toBe(1)
    expect(r.apps.length).toBeLessThanOrEqual(24)
    expect(r.totalPages).toBe(Math.ceil(r.total / 24))

    const last = searchCatalog({ page: r.totalPages, pageSize: 24 })
    expect(last.apps.length).toBeGreaterThan(0)

    const beyond = searchCatalog({ page: r.totalPages + 10, pageSize: 24 })
    expect(beyond.apps.length).toBe(0)
  })

  test("mappe les catégories et schémas d'auth vers les types internes", () => {
    expect(mapCategory("email")).toBe("COMMUNICATION")
    expect(mapCategory("developer tools")).toBe("DEVELOPMENT")
    expect(mapCategory("crm")).toBe("CRM")
    expect(mapAuthScheme(["OAUTH2"])).toBe("OAUTH2")
    expect(mapAuthScheme(["API_KEY"])).toBe("API_KEY")
    expect(mapAuthScheme([])).toBe("API_KEY")
  })
})

describe("Registre des endpoints OAuth réels", () => {
  test("référence les apps populaires avec des endpoints valides", () => {
    for (const slug of ["github", "slack", "notion", "linear", "jira", "discord"]) {
      const e = getOAuthEndpoints(slug)
      expect(e, `endpoints ${slug}`).not.toBeNull()
      expect(e!.authorizeUrl).toMatch(/^https:\/\//)
      expect(e!.tokenUrl).toMatch(/^https:\/\//)
      expect(e!.baseUrl).toMatch(/^https:\/\//)
      expect(e!.docsUrl).toMatch(/^https?:\/\//)
    }
  })

  test("utilise PKCE pour les fournisseurs qui l'exigent", () => {
    expect(OAUTH_ENDPOINTS.twitter.usePkce).toBe(true)
    expect(OAUTH_ENDPOINTS.linear.usePkce).toBe(true)
    expect(OAUTH_ENDPOINTS.notion.usePkce).toBe(true)
    expect(OAUTH_ENDPOINTS.github.usePkce).toBe(false)
  })
})

describe("Parseur OpenAPI → actions exécutables", () => {
  const spec = {
    openapi: "3.0.0",
    info: { title: "API Test", description: "Spécification de test" },
    servers: [{ url: "https://api.test.com/v1" }],
    paths: {
      "/users/{id}": {
        get: {
          operationId: "getUser",
          summary: "Récupère un utilisateur",
          parameters: [
            { name: "id", in: "path", required: true, type: "string" },
            { name: "verbose", in: "query", type: "boolean" },
          ],
        },
      },
      "/messages": {
        post: {
          operationId: "sendMessage",
          summary: "Envoie un message",
          parameters: [{ name: "channel", in: "query", type: "string" }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Contenu" },
                    priority: { type: "string", enum: ["low", "high"] },
                  },
                  required: ["text"],
                },
              },
            },
          },
        },
      },
    },
  }

  test("convertit les opérations en actions réelles typées", () => {
    const parsed = parseOpenApi(spec)
    expect(parsed.baseUrl).toBe("https://api.test.com/v1")
    expect(parsed.actions).toHaveLength(2)

    const getUser = parsed.actions.find((a) => a.slug === "GETUSER")
    expect(getUser).toBeDefined()
    expect(getUser!.method).toBe("GET")
    expect(getUser!.path).toBe("users/{id}")
    expect(getUser!.params.find((p) => p.name === "id")?.in).toBe("path")
    expect(getUser!.params.find((p) => p.name === "id")?.required).toBe(true)

    const sendMessage = parsed.actions.find((a) => a.slug === "SENDMESSAGE")
    expect(sendMessage!.method).toBe("POST")
    expect(sendMessage!.params.find((p) => p.name === "text")?.required).toBe(true)
    expect(sendMessage!.params.find((p) => p.name === "priority")?.type).toBe("enum")
    expect(sendMessage!.params.find((p) => p.name === "priority")?.enum).toEqual(["low", "high"])
    expect(sendMessage!.auth).toEqual({ style: "bearer" })
  })

  test("valide les specs invalides proprement", () => {
    expect(tryParseSpec("pas du tout json").ok).toBe(false)
    expect(tryParseSpec('{"foo": 1}').ok).toBe(false)
    const ok = tryParseSpec(JSON.stringify(spec))
    expect(ok.ok).toBe(true)
  })

  test("tronque les specs volumineuses avec avertissement", () => {
    const big: Record<string, unknown> = { ...spec, paths: {} }
    for (let i = 0; i < 500; i++) {
      ;(big.paths as Record<string, Record<string, unknown>>)[`/r${i}`] = {
        get: { operationId: `op${i}`, summary: `Op ${i}` },
      }
    }
    const parsed = parseOpenApi(big, { maxActions: 50 })
    expect(parsed.actions.length).toBe(50)
    expect(parsed.warnings.some((w) => w.includes("50"))).toBe(true)
  })
})
