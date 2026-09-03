/**
 * Moteur OAuth 1.0a (RFC 5849) — flux "three-legged" complet :
 * 1. request_token (signé HMAC-SHA1)
 * 2. redirection utilisateur vers authorizeUrl
 * 3. exchange oauth_token + verifier → access token
 *
 * La signature par requête est également exposée pour l'exécution
 * d'actions (Trello, anciennes API…). Implémentation 100 % locale.
 */

import crypto from "node:crypto"
import type { OAuth1ConnectionData, OAuth1ProviderConfig } from "./types"

// ─────────────────────────────────────────────────────────────
// Encodage et signature (RFC 5849 §3.4 — HMAC-SHA1)
// ─────────────────────────────────────────────────────────────

/** Encodage percent-strict RFC 3986 (exigé par OAuth1). */
export function percentEncode(input: string): string {
  return encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
}

/**
 * Signature base string (RFC 5849 §3.4.1) :
 * METHOD&percentEncode(baseUri)&percentEncode(normalizedParams).
 */
export function signatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const parsed = new URL(url)
  // Base URI : schéma+hôte+chemin, sans query ni fragment (§3.4.1.2).
  const baseUri = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  const allParams: [string, string][] = []
  for (const [k, v] of new URLSearchParams(parsed.search)) {
    allParams.push([k, v])
  }
  for (const [k, v] of Object.entries(params)) {
    allParams.push([k, v])
  }
  allParams.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const normalized = allParams
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join("&")
  return [method.toUpperCase(), percentEncode(baseUri), percentEncode(normalized)].join("&")
}

/** Clé de signature : percentEncode(consumerSecret)&percentEncode(tokenSecret). */
export function signingKey(consumerSecret: string, tokenSecret: string): string {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`
}

/** Signature HMAC-SHA1 encodée en base64 standard. */
export function hmacSha1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const base = signatureBaseString(method, url, params)
  const key = signingKey(consumerSecret, tokenSecret)
  return crypto.createHmac("sha1", key).update(base).digest("base64")
}

// ─────────────────────────────────────────────────────────────
// En-tête Authorization: OAuth (RFC 5849 §3.5.1)
// ─────────────────────────────────────────────────────────────

export interface OAuth1SignContext {
  consumerKey: string
  consumerSecret: string
  oauthToken?: string
  oauthTokenSecret?: string
  /** Paramètres métier de la requête (query + body form). */
  extraParams?: Record<string, string>
}

/** Construit l'en-tête `Authorization: OAuth …` signé pour une requête. */
export function buildOAuth1Header(method: string, url: string, ctx: OAuth1SignContext): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: ctx.consumerKey,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_version: "1.0",
    ...(ctx.oauthToken ? { oauth_token: ctx.oauthToken } : {}),
  }
  const signature = hmacSha1Signature(
    method,
    url,
    { ...oauthParams, ...(ctx.extraParams ?? {}) },
    ctx.consumerSecret,
    ctx.oauthTokenSecret ?? ""
  )
  const headerParams = { ...oauthParams, oauth_signature: signature }
  const header = Object.entries(headerParams)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ")
  return `OAuth ${header}`
}

// ─────────────────────────────────────────────────────────────
// Flux three-legged (RFC 5849 §2)
// ─────────────────────────────────────────────────────────────

export interface OAuth1RequestToken {
  oauthToken: string
  oauthTokenSecret: string
  /** true si l'URL authorize accepte oauth_callback (mode 1.0a). */
  callbackConfirmed: boolean
}

/** Étape 1 : obtention d'un request token signé. */
export async function fetchRequestToken(
  config: OAuth1ProviderConfig,
  callbackUrl: string
): Promise<OAuth1RequestToken> {
  const url = config.requestTokenUrl
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.consumerKey,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_version: "1.0",
    oauth_callback: callbackUrl,
  }
  const signature = hmacSha1Signature("POST", url, oauthParams, config.consumerSecret, "")
  const headerParams = { ...oauthParams, oauth_signature: signature }
  const header = Object.entries(headerParams)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ")

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `OAuth ${header}` },
    signal: AbortSignal.timeout(15_000),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`OAuth1 request_token échoué : HTTP ${res.status} — ${raw.slice(0, 300)}`)
  const body = Object.fromEntries(new URLSearchParams(raw))
  if (!body.oauth_token || !body.oauth_token_secret) {
    throw new Error(`OAuth1 request_token invalide : réponse sans token (${raw.slice(0, 200)})`)
  }
  return {
    oauthToken: body.oauth_token,
    oauthTokenSecret: body.oauth_token_secret,
    callbackConfirmed: body.oauth_callback_confirmed === "true",
  }
}

/** Étape 2 : URL d'autorisation à présenter à l'utilisateur. */
export function buildOAuth1AuthorizeUrl(
  config: OAuth1ProviderConfig,
  requestToken: OAuth1RequestToken
): string {
  const url = new URL(config.authorizeUrl)
  url.searchParams.set("oauth_token", requestToken.oauthToken)
  return url.toString()
}

/** Étape 3 : échange request_token + verifier → access token. */
export async function exchangeRequestToken(
  config: OAuth1ProviderConfig,
  requestToken: Pick<OAuth1RequestToken, "oauthToken" | "oauthTokenSecret">,
  oauthVerifier: string
): Promise<OAuth1ConnectionData> {
  const url = config.accessTokenUrl
  const header = buildOAuth1Header("POST", url, {
    consumerKey: config.consumerKey,
    consumerSecret: config.consumerSecret,
    oauthToken: requestToken.oauthToken,
    oauthTokenSecret: requestToken.oauthTokenSecret,
    extraParams: { oauth_verifier: oauthVerifier },
  })
  // oauth_verifier doit figurer dans la signature ET dans la requête.
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: header },
    signal: AbortSignal.timeout(15_000),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`OAuth1 access_token échoué : HTTP ${res.status} — ${raw.slice(0, 300)}`)
  const body = Object.fromEntries(new URLSearchParams(raw))
  if (!body.oauth_token || !body.oauth_token_secret) {
    throw new Error(`OAuth1 access_token invalide : réponse sans token (${raw.slice(0, 200)})`)
  }
  return {
    authScheme: "OAUTH1",
    status: "ACTIVE",
    oauth_token: body.oauth_token,
    oauth_token_secret: body.oauth_token_secret,
    consumer_key: config.consumerKey,
  }
}
