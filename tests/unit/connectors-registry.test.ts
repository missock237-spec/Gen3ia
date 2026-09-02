import { describe, test, expect } from "bun:test"
import { getApp, listApps, getAction, appAvailability } from "@/lib/connectors/apps"
import { connectorToolKey, parseConnectorToolKey } from "@/lib/connectors/core/toolset"
import { AuthScheme } from "@/lib/connectors/core/auth-scheme"

/** Catalogue d'applications (registre local des toolkits). */
describe("connectors/registry — catalogue", () => {
  test("13 applications réelles au catalogue", () => {
    expect(listApps().length).toBe(13)
  })

  test("slugs uniques", () => {
    const slugs = listApps().map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test("chaque app expose des actions complètes et documentées", () => {
    for (const app of listApps()) {
      expect(app.actions.length).toBeGreaterThanOrEqual(3)
      expect(app.baseUrl).toMatch(/^https:\/\//)
      expect(app.docsUrl).toMatch(/^https:\/\//)
      expect(app.name.length).toBeGreaterThan(1)
      for (const action of app.actions) {
        expect(action.slug).toMatch(/^[a-z0-9_]+$/)
        expect(action.description.length).toBeGreaterThan(10)
        expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(action.method)
        for (const p of action.params) {
          expect(p.description.length).toBeGreaterThan(3)
          expect(["path", "query", "body", "header"]).toContain(p.in)
        }
      }
    }
  })

  test("getAction résout app + action", () => {
    const found = getAction("github", "create_issue")
    expect(found).not.toBeNull()
    expect(found?.app.name).toBe("GitHub")
    expect(found?.action.method).toBe("POST")
  })

  test("action inconnue → null", () => {
    expect(getAction("github", "nonexistent")).toBeNull()
    expect(getAction("nonexistent", "x")).toBeNull()
  })

  test("aucun identifiant hardcodé (env uniquement)", () => {
    for (const app of listApps()) {
      if (app.oauth2) {
        expect(app.oauth2.clientId).not.toMatch(/^(ghp_|xoxb-|sk_live_)/)
        // Sans env, les clés sont vides (jamais de valeurs fictives).
      }
    }
  })
})

describe("connectors/registry — disponibilité", () => {
  test("app OAuth2 non configurée sans env → non connectable en mode OAUTH", () => {
    const github = getApp("github")
    expect(github).not.toBeNull()
    const availability = appAvailability(github!)
    expect(availability.connectable).toBe(true) // import PAT supporté
    expect(availability.mode).toBe("TOKEN_IMPORT")
  })

  test("app sans token import ni OAuth configuré → indisponible", () => {
    const gmail = getApp("gmail")
    expect(gmail).not.toBeNull()
    // Gmail n'accepte pas l'import direct : sans client OAuth, indisponible.
    const availability = appAvailability(gmail!)
    expect(availability.mode).toBe("UNAVAILABLE")
    expect(availability.connectable).toBe(false)
  })

  test("Notion (token import) toujours connectable", () => {
    const notion = getApp("notion")
    expect(appAvailability(notion!).mode).toBe("TOKEN_IMPORT")
  })

  test("Jira → formulaire d'identifiants", () => {
    const jira = getApp("jira")
    expect(appAvailability(jira!).mode).toBe("CREDENTIALS")
  })
})

/** Fabrique AuthScheme (portée de Composio). */
describe("connectors/auth-scheme — fabrique ConnectionData", () => {
  test("OAuth2 : token présent ⇒ ACTIVE, absent ⇒ INITIALIZING", () => {
    expect(AuthScheme.OAuth2({ access_token: "t" }).status).toBe("ACTIVE")
    expect(AuthScheme.OAuth2({}).status).toBe("INITIALIZING")
  })

  test("OAuth1 : paire de tokens ⇒ ACTIVE", () => {
    expect(
      AuthScheme.OAuth1({ oauth_token: "t", oauth_token_secret: "s" }).status
    ).toBe("ACTIVE")
    expect(AuthScheme.OAuth1({ oauth_token: "t" }).status).toBe("INITIALIZING")
  })

  test("APIKey / Basic / Bearer / NoAuth ⇒ ACTIVE direct", () => {
    expect(AuthScheme.APIKey({ api_key: "k" }).status).toBe("ACTIVE")
    expect(AuthScheme.Basic({ username: "u", password: "p" }).status).toBe("ACTIVE")
    expect(AuthScheme.BearerToken({ bearer_token: "b" }).status).toBe("ACTIVE")
    expect(AuthScheme.NoAuth().status).toBe("ACTIVE")
  })
})

describe("connectors/toolset — clés d'outil", () => {
  test("clé canonique roundtrip", () => {
    const key = connectorToolKey("github", "create_issue")
    expect(key).toBe("connector_github_create_issue")
    expect(parseConnectorToolKey(key)).toEqual({ appSlug: "github", actionSlug: "create_issue" })
  })

  test("clés non-connector rejetées", () => {
    expect(parseConnectorToolKey("web_search")).toBeNull()
    expect(parseConnectorToolKey("connector")).toBeNull()
    expect(parseConnectorToolKey("connector_")).toBeNull()
  })
})
