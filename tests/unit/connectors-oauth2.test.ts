import { describe, test, expect } from "bun:test"
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  isTokenExpired,
  refreshAccessToken,
  decodeJwtPayload,
} from "@/lib/connectors/core/oauth2"
import type { OAuth2ProviderConfig, OAuth2ConnectionData } from "@/lib/connectors/core/types"

const config: OAuth2ProviderConfig = {
  clientId: "client-id-42",
  clientSecret: "client-secret-42",
  authorizeUrl: "https://provider.test/oauth/authorize",
  tokenUrl: "https://provider.test/oauth/token",
  scopes: ["repo", "read:user"],
}

/** Moteur OAuth2 — RFC 6749/7636. */
describe("connectors/oauth2 — URL d'autorisation", () => {
  test("paramètres RFC 6749 §3.1 complets", () => {
    const url = new URL(
      buildAuthorizeUrl({ config, redirectUri: "https://app.test/cb", state: "st4te" })
    )
    expect(url.origin + url.pathname).toBe("https://provider.test/oauth/authorize")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("client-id-42")
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb")
    expect(url.searchParams.get("state")).toBe("st4te")
    expect(url.searchParams.get("scope")).toBe("repo read:user")
  })

  test("PKCE : challenge S256 transmis", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config,
        redirectUri: "https://app.test/cb",
        state: "s",
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      })
    )
    expect(url.searchParams.get("code_challenge")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
  })

  test("paramètres additionnels fusionnés (Google access_type)", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: { ...config, extraAuthorizeParams: { access_type: "offline" } },
        redirectUri: "https://app.test/cb",
        state: "s",
      })
    )
    expect(url.searchParams.get("access_type")).toBe("offline")
  })

  test("user scopes Slack séparés (user_scope)", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: { ...config, userScopes: ["identity.email"] },
        redirectUri: "https://app.test/cb",
        state: "s",
      })
    )
    expect(url.searchParams.get("user_scope")).toBe("identity.email")
  })
})

describe("connectors/oauth2 — échange et rafraîchissement", () => {
  test("échange de code : parsing complet de la réponse token", async () => {
    const calls: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      calls.push(String(input))
      expect(init.method).toBe("POST")
      const body = new URLSearchParams(init.body)
      expect(body.get("grant_type")).toBe("authorization_code")
      expect(body.get("code")).toBe("the-code")
      expect(body.get("code_verifier")).toBe("the-verifier")
      expect(body.get("client_secret")).toBe("client-secret-42")
      return new Response(
        JSON.stringify({
          access_token: "at-123",
          refresh_token: "rt-456",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "repo read:user",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }) as any
    try {
      const data = await exchangeCodeForTokens({
        config,
        code: "the-code",
        redirectUri: "https://app.test/cb",
        codeVerifier: "the-verifier",
      })
      expect(data.access_token).toBe("at-123")
      expect(data.refresh_token).toBe("rt-456")
      expect(data.status).toBe("ACTIVE")
      expect(data.expires_in).toBe(3600)
      expect(typeof data.expires_at).toBe("string")
      expect(Date.parse(data.expires_at as string)).toBeGreaterThan(Date.now() + 3000_000)
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(calls[0]).toBe("https://provider.test/oauth/token")
  })

  test("erreur RFC 6749 §5.2 remonte explicitement", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "code expiré" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )) as any
    try {
      expect(
        exchangeCodeForTokens({ config, code: "bad", redirectUri: "https://app.test/cb" })
      ).rejects.toThrow(/invalid_grant/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("refresh : conserve l'ancien refresh_token si omis (RFC 6749 §6)", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: "new-at", expires_in: 1800 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as any
    try {
      const conn: OAuth2ConnectionData = {
        authScheme: "OAUTH2",
        status: "ACTIVE",
        access_token: "old-at",
        refresh_token: "keep-rt",
      }
      const refreshed = await refreshAccessToken(config, conn)
      expect(refreshed?.access_token).toBe("new-at")
      expect(refreshed?.refresh_token).toBe("keep-rt")
      expect(refreshed?.status).toBe("ACTIVE")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("sans refresh_token → null (pas d'appel réseau)", async () => {
    const conn: OAuth2ConnectionData = {
      authScheme: "OAUTH2",
      status: "ACTIVE",
      access_token: "at",
      refresh_token: null,
    }
    expect(await refreshAccessToken(config, conn)).toBeNull()
  })
})

describe("connectors/oauth2 — expiration", () => {
  test("token non expiré", () => {
    expect(
      isTokenExpired({
        authScheme: "OAUTH2",
        status: "ACTIVE",
        access_token: "x",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    ).toBe(false)
  })

  test("token expirant dans < 60 s considéré expiré", () => {
    expect(
      isTokenExpired({
        authScheme: "OAUTH2",
        status: "ACTIVE",
        access_token: "x",
        expires_at: new Date(Date.now() + 30_000).toISOString(),
      })
    ).toBe(true)
  })

  test("absence de date d'expiration = jamais expiré", () => {
    expect(isTokenExpired({ authScheme: "OAUTH2", status: "ACTIVE", access_token: "x" })).toBe(false)
  })
})

describe("connectors/oauth2 — JWT (id_token)", () => {
  test("payload décodé d'un JWT HS256", () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o))
    const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "user-7", email: "a@b.c" })}.sig`
    const payload = decodeJwtPayload(jwt)
    expect(payload?.sub).toBe("user-7")
    expect(payload?.email).toBe("a@b.c")
  })

  test("JWT invalide → null sans throw", () => {
    expect(decodeJwtPayload("pas-un-jwt")).toBeNull()
  })
})
