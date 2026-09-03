import { describe, test, expect } from "bun:test"
import { buildRequest, effectiveToken, assertExecutableConnection } from "@/lib/connectors/core/executor"
import type { ActionSpec, AppDefinition, ConnectionData } from "@/lib/connectors/core/types"

/** Moteur d'exécution : construction de requêtes réelles. */
const app: AppDefinition = {
  slug: "fake",
  name: "Fake",
  description: "App de test structurelle",
  category: "DEVELOPMENT",
  logo: "x",
  docsUrl: "https://docs.test",
  baseUrl: "https://api.test/v1",
  authScheme: "OAUTH2",
  actions: [],
}

const oauthConn: ConnectionData = {
  authScheme: "OAUTH2",
  status: "ACTIVE",
  access_token: "tok-123",
}

describe("connectors/executor — buildRequest", () => {
  test("path params substitués et encodés, query séparée", () => {
    const action: ActionSpec = {
      slug: "get_issue",
      name: "Get",
      description: "",
      method: "GET",
      path: "/repos/{owner}/{repo}/issues/{number}",
      params: [
        { name: "owner", type: "string", description: "", required: true, in: "path" },
        { name: "repo", type: "string", description: "", required: true, in: "path" },
        { name: "number", type: "integer", description: "", required: true, in: "path" },
        { name: "state", type: "enum", description: "", required: false, in: "query", enum: ["open", "closed"], default: "open" },
      ],
    }
    const req = buildRequest(app, action, oauthConn, {
      owner: "acme corp",
      repo: "mono/repo",
      number: "42",
    })
    const url = new URL(req.url)
    expect(url.pathname).toBe("/v1/repos/acme%20corp/mono%2Frepo/issues/42")
    expect(url.searchParams.get("state")).toBe("open")
    expect(req.headers.Authorization).toBe("Bearer tok-123")
    expect(req.body).toBeUndefined()
  })

  test("body JSON sérialisé avec Content-Type", () => {
    const action: ActionSpec = {
      slug: "create_issue",
      name: "Create",
      description: "",
      method: "POST",
      path: "/issues",
      params: [
        { name: "title", type: "string", description: "", required: true, in: "body" },
        { name: "labels", type: "array", description: "", required: false, in: "body" },
      ],
    }
    const req = buildRequest(app, action, oauthConn, {
      title: "Bug bloquant",
      labels: '["bug","urgent"]',
    })
    expect(req.method).toBe("POST")
    expect(req.headers["Content-Type"]).toBe("application/json")
    const body = JSON.parse(req.body as string)
    expect(body.title).toBe("Bug bloquant")
    expect(body.labels).toEqual(["bug", "urgent"])
  })

  test("injection header avec template {{token}}", () => {
    const action: ActionSpec = {
      slug: "x",
      name: "X",
      description: "",
      method: "GET",
      path: "/me",
      params: [],
      auth: { style: "header", name: "X-Api-Key", template: "{{token}}" },
    }
    const conn: ConnectionData = { authScheme: "API_KEY", status: "ACTIVE", api_key: "key-42" }
    const req = buildRequest(app, action, conn, {})
    expect(req.headers["X-Api-Key"]).toBe("key-42")
    expect(req.headers.Authorization).toBeUndefined()
  })

  test("injection query (clé dans l'URL)", () => {
    const action: ActionSpec = {
      slug: "x",
      name: "X",
      description: "",
      method: "GET",
      path: "/data",
      params: [],
      auth: { style: "query", name: "apikey", template: "{{token}}" },
    }
    const conn: ConnectionData = { authScheme: "BEARER_TOKEN", status: "ACTIVE", bearer_token: "q-token" }
    const req = buildRequest(app, action, conn, {})
    expect(new URL(req.url).searchParams.get("apikey")).toBe("q-token")
  })

  test("injection pathPrefix (Telegram /bot<token>/…)", () => {
    const telegramLikeApp: AppDefinition = { ...app, baseUrl: "https://api.test" }
    const action: ActionSpec = {
      slug: "send",
      name: "Send",
      description: "",
      method: "POST",
      path: "sendMessage",
      params: [{ name: "chat_id", type: "string", description: "", required: true, in: "body" }],
      auth: { style: "pathPrefix", template: "/bot{{token}}" },
    }
    const conn: ConnectionData = { authScheme: "API_KEY", status: "ACTIVE", api_key: "1122:AABB" }
    const req = buildRequest(telegramLikeApp, action, conn, { chat_id: "42" })
    const url = new URL(req.url)
    expect(url.pathname).toBe("/bot1122:AABB/sendMessage")
    const body = JSON.parse(req.body as string)
    expect(body.chat_id).toBe("42")
  })

  test("basic auth (base64 user:pass)", () => {
    const action: ActionSpec = {
      slug: "search",
      name: "Search",
      description: "",
      method: "POST",
      path: "/search",
      params: [],
      auth: { style: "basic" },
    }
    const conn: ConnectionData = {
      authScheme: "BASIC",
      status: "ACTIVE",
      username: "me@corp.com",
      password: "token-9",
    }
    const req = buildRequest(app, action, conn, {})
    expect(req.headers.Authorization).toBe(
      `Basic ${Buffer.from("me@corp.com:token-9").toString("base64")}`
    )
  })

  test("hook prepare : transformations spécifiques (Gmail raw)", () => {
    const action: ActionSpec = {
      slug: "send_email",
      name: "Send",
      description: "",
      method: "POST",
      path: "/messages/send",
      params: [
        { name: "to", type: "string", description: "", required: true, in: "body" },
        { name: "subject", type: "string", description: "", required: true, in: "body" },
        { name: "body", type: "string", description: "", required: true, in: "body" },
      ],
      prepare: (params) => ({
        raw: Buffer.from(
          `To: ${params.to}\r\nSubject: ${params.subject}\r\n\r\n${params.body}`
        ).toString("base64url"),
      }),
    }
    const req = buildRequest(app, action, oauthConn, {
      to: "dest@x.io",
      subject: "Hello",
      body: "Contenu",
    })
    const body = JSON.parse(req.body as string)
    expect(body.raw).toBe(
      Buffer.from("To: dest@x.io\r\nSubject: Hello\r\n\r\nContenu").toString("base64url")
    )
    expect(body.to).toBeUndefined()
  })

  test("surcharge baseUrl via base_url (instance self-hosted)", () => {
    const action: ActionSpec = {
      slug: "x",
      name: "X",
      description: "",
      method: "GET",
      path: "/ping",
      params: [],
    }
    const conn: ConnectionData = {
      authScheme: "OAUTH2",
      status: "ACTIVE",
      access_token: "t",
      base_url: "https://corp.example.com/api",
    }
    const req = buildRequest(app, action, conn, {})
    expect(new URL(req.url).origin).toBe("https://corp.example.com")
  })

  test("paramètre requis manquant → erreur explicite", () => {
    const action: ActionSpec = {
      slug: "x",
      name: "X",
      description: "",
      method: "POST",
      path: "/items",
      params: [{ name: "title", type: "string", description: "titre", required: true, in: "body" }],
    }
    expect(() => buildRequest(app, action, oauthConn, {})).toThrow(/title/)
  })

  test("valeur hors enum refusée", () => {
    const action: ActionSpec = {
      slug: "x",
      name: "X",
      description: "",
      method: "GET",
      path: "/list",
      params: [
        { name: "state", type: "enum", description: "", required: true, in: "query", enum: ["open", "closed"] },
      ],
    }
    expect(() => buildRequest(app, action, oauthConn, { state: "half" })).toThrow(/énumération/)
  })

  test("coercition integer (chaîne → nombre tronqué)", () => {
    const action: ActionSpec = {
      slug: "x",
      name: "X",
      description: "",
      method: "GET",
      path: "/n/{n}",
      params: [{ name: "n", type: "integer", description: "", required: true, in: "path" }],
    }
    const req = buildRequest(app, action, oauthConn, { n: "12.7" })
    expect(new URL(req.url).pathname).toBe("/v1/n/12")
  })

  test("corps form-urlencoded (Stripe)", () => {
    const action: ActionSpec = {
      slug: "customer",
      name: "Customer",
      description: "",
      method: "POST",
      path: "/customers",
      bodyContentType: "form",
      params: [
        { name: "name", type: "string", description: "", required: true, in: "body" },
        { name: "email", type: "string", description: "", required: false, in: "body" },
      ],
    }
    const req = buildRequest(app, action, oauthConn, { name: "Alice", email: "a@x.io" })
    expect(req.headers["Content-Type"]).toBe("application/x-www-form-urlencoded")
    expect(req.body).toBe("name=Alice&email=a%40x.io")
  })
})

describe("connectors/executor — effectiveToken", () => {
  test("Slack : le token utilisateur prime sur le token bot", () => {
    expect(
      effectiveToken({
        authScheme: "OAUTH2",
        status: "ACTIVE",
        access_token: "xoxb-bot",
        authed_user: { access_token: "xoxp-user" },
      })
    ).toBe("xoxp-user")
  })

  test("OAuth1 : oauth_token", () => {
    expect(
      effectiveToken({ authScheme: "OAUTH1", status: "ACTIVE", oauth_token: "ot" })
    ).toBe("ot")
  })

  test("sans identifiant → null", () => {
    expect(effectiveToken({ authScheme: "NO_AUTH", status: "ACTIVE" })).toBeNull()
  })
})

describe("connectors/executor — assertExecutableConnection", () => {
  test("ACTIVE → exécutable", () => {
    expect(assertExecutableConnection(oauthConn).ok).toBe(true)
  })

  test("FAILED → refus explicite", () => {
    const r = assertExecutableConnection({ ...oauthConn, status: "FAILED" })
    expect(r.ok).toBe(false)
  })

  test("token expiré → rafraîchissement requis", () => {
    const r = assertExecutableConnection({
      ...oauthConn,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    expect(r.ok).toBe(false)
  })
})
