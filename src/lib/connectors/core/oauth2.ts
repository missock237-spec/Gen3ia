/**
 * Moteur OAuth 2.0 (RFC 6749 + RFC 7636) — flux "Authorization Code"
 * avec PKCE optionnel, échange de code, rafraîchissement de token
 * et révocation. Implémentation locale complète : la parallèle
 * serveur de Composio exécute ces mêmes étapes sur leur plateforme ;
 * ici tout est embarqué dans GEN3IA, sans intermédiaire.
 */

import crypto from "node:crypto"
import type { OAuth2ConnectionData, OAuth2ProviderConfig } from "./types"
import { ConnectionStatuses } from "./types"

// ─────────────────────────────────────────────────────────────
// Construction des URLs d'autorisation
// ─────────────────────────────────────────────────────────────

export interface AuthorizeUrlParams {
  config: OAuth2ProviderConfig
  redirectUri: string
  state: string
  codeChallenge?: string
  /** Login hint (pré-remplissage email, Google). */
  loginHint?: string
}

/**
 * Construit l'URL d'autorisation (RFC 6749 §3.1).
 * response_type=code ; PKCE S256 si codeChallenge fourni.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const { config, redirectUri, state, codeChallenge, loginHint } = params
  const url = new URL(config.authorizeUrl)
  const q: Record<string, string> = {
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    scope: config.scopes.join(" "),
    ...config.extraAuthorizeParams,
  }
  if (config.userScopes?.length) {
    // Slack : user_scope en parallèle de scope (bot).
    q.user_scope = config.userScopes.join(" ")
  }
  if (codeChallenge) {
    q.code_challenge = codeChallenge
    q.code_challenge_method = "S256"
  }
  if (loginHint) q.login_hint = loginHint
  if (config.alwaysPromptConsent) {
    // Google : force le renvoi du refresh_token (access_type=offline).
    q.prompt = "consent"
    q.access_type = "offline"
  }
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v)
  return url.toString()
}

// ─────────────────────────────────────────────────────────────
// Échange de code → tokens
// ─────────────────────────────────────────────────────────────

export interface TokenExchangeParams {
  config: OAuth2ProviderConfig
  code: string
  redirectUri: string
  codeVerifier?: string
}

/** Parse la réponse token (JSON, RFC 6749 §5.1). */
function parseTokenResponse(json: Record<string, unknown>): OAuth2ConnectionData {
  const expiresIn = typeof json.expires_in === "string" ? Number(json.expires_in) : json.expires_in
  const base: OAuth2ConnectionData = {
    authScheme: "OAUTH2",
    status: ConnectionStatuses.ACTIVE,
    access_token: typeof json.access_token === "string" ? json.access_token : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : null,
    id_token: typeof json.id_token === "string" ? json.id_token : undefined,
    expires_in: typeof expiresIn === "number" ? expiresIn : null,
    expires_at: typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scope: typeof json.scope === "string" ? json.scope : null,
    authed_user:
      typeof json.authed_user === "object" && json.authed_user !== null
        ? (json.authed_user as { access_token?: string; scope?: string })
        : null,
  }
  return base
}

/**
 * Échange le code d'autorisation contre des tokens (RFC 6749 §4.1.3).
 * Lève une erreur explicite (RFC 6749 §5.2) — aucun fallback silencieux.
 */
export async function exchangeCodeForTokens(params: TokenExchangeParams): Promise<OAuth2ConnectionData> {
  const { config, code, redirectUri, codeVerifier } = params
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    ...config.extraTokenParams,
  }
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(
      `Échange de code OAuth2 échoué : HTTP ${res.status} — ${raw.slice(0, 400)}`
    )
  }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // Certains fournisseurs renvoient du x-www-form-urlencoded.
    json = Object.fromEntries(new URLSearchParams(raw))
  }
  if (json.error) {
    throw new Error(
      `Échange de code OAuth2 refusé : ${json.error}${json.error_description ? ` — ${json.error_description}` : ""}`
    )
  }
  return parseTokenResponse(json)
}

// ─────────────────────────────────────────────────────────────
// Rafraîchissement d'access token
// ─────────────────────────────────────────────────────────────

/**
 * Rafraîchit un access token via refresh_token (RFC 6749 §6).
 * Retourne null si la connexion n'a pas de refresh_token.
 */
export async function refreshAccessToken(
  config: OAuth2ProviderConfig,
  connection: OAuth2ConnectionData
): Promise<OAuth2ConnectionData | null> {
  if (!connection.refresh_token) return null
  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...config.extraTokenParams,
  }
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Rafraîchissement OAuth2 échoué : HTTP ${res.status} — ${raw.slice(0, 300)}`)
  }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(raw) as Record<string, unknown>
  } catch {
    json = Object.fromEntries(new URLSearchParams(raw))
  }
  if (json.error) {
    throw new Error(
      `Rafraîchissement OAuth2 refusé : ${json.error}${json.error_description ? ` — ${json.error_description}` : ""}`
    )
  }
  const refreshed = parseTokenResponse(json)
  // RFC 6749 §6 : refresh_token peut être omis (l'ancien reste valable).
  return {
    ...connection,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? connection.refresh_token,
    status: ConnectionStatuses.ACTIVE,
  }
}

// ─────────────────────────────────────────────────────────────
// Révocation
// ─────────────────────────────────────────────────────────────

/** Révoque un token (RFC 7009) — best effort, pas de throw. */
export async function revokeToken(
  config: OAuth2ProviderConfig,
  token: string
): Promise<boolean> {
  if (!config.revokeUrl) return false
  try {
    const res = await fetch(config.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// Décodage d'id_token (JWT) — extraction d'infos de compte
// ─────────────────────────────────────────────────────────────

/** Décode le payload d'un JWT sans vérifier la signature (infos publiques). */
export function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  try {
    const [, payload] = idToken.split(".")
    if (!payload) return null
    const json = Buffer.from(payload, "base64url").toString("utf8")
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Slack : exchange OAuth v2.access (bot + user combinés)
// ─────────────────────────────────────────────────────────────

/**
 * Slack renvoie une réponse spécifique (auth.v2.access / oauth.v2.access)
 * combinant bot + user. Ce parseur fusionne les deux niveaux.
 */
export async function exchangeSlackCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<OAuth2ConnectionData> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw new Error(`Slack OAuth échoué : HTTP ${res.status}`)
  }
  const json = (await res.json()) as {
    ok: boolean
    error?: string
    access_token?: string
    token_type?: string
    scope?: string
    bot_user_id?: string
    team?: { id?: string; name?: string }
    authed_user?: { id?: string; access_token?: string; scope?: string }
  }
  if (!json.ok) {
    throw new Error(`Slack OAuth refusé : ${json.error ?? "réponse ok=false"}`)
  }
  return {
    authScheme: "OAUTH2",
    status: ConnectionStatuses.ACTIVE,
    access_token: json.access_token,
    token_type: "Bearer",
    scope: json.scope ?? null,
    refresh_token: null,
    expires_at: null,
    authed_user: json.authed_user
      ? { access_token: json.authed_user.access_token, scope: json.authed_user.scope }
      : null,
  }
}

// ─────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────

/** Un access token est-il expiré (ou expirant dans < 60 s) ? */
export function isTokenExpired(connection: OAuth2ConnectionData): boolean {
  if (!connection.expires_at) return false
  const t = Date.parse(connection.expires_at)
  if (Number.isNaN(t)) return false
  return t - Date.now() < 60_000
}

/** Génère un secret client aléatoire (usage interne, tests). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url")
}
