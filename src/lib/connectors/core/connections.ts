/**
 * Service des comptes connectés — orchestration persistante :
 * - initiation des connexions (state signé + PKCE, request token OAuth1) ;
 * - complétion (callback) : échange de code, import de token ;
 * - rafraîchissement automatique avant exécution ;
 * - chiffrement AES-256-GCM de tous les secrets (core/crypto).
 *
 * Équivalent local des modèles Composio ConnectedAccounts /
 * ConnectionRequest (MIT, Sampark Inc.), avec persistance Prisma.
 */

import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { getApp, appAvailability } from "../apps"
import {
  decryptJson,
  encryptJson,
  generatePkcePair,
  googleServiceAccountAccessToken,
  needsRotation,
  signState,
  verifyState,
} from "./crypto"
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  exchangeSlackCode,
  isTokenExpired,
  refreshAccessToken,
  revokeToken,
} from "./oauth2"
import {
  buildOAuth1AuthorizeUrl,
  exchangeRequestToken,
  fetchRequestToken,
} from "./oauth1"
import { AuthScheme } from "./auth-scheme"
import type {
  AppDefinition,
  ConnectedAccountMeta,
  ConnectedAccountView,
  ConnectionData,
  GoogleServiceAccountConnectionData,
  OAuth2ConnectionData,
} from "./types"
import { AuthSchemeTypes, ConnectionStatuses } from "./types"

const REQUEST_TTL_MS = 10 * 60 * 1000 // 10 minutes pour finir un flux OAuth

// ─────────────────────────────────────────────────────────────
// Helpers persistance
// ─────────────────────────────────────────────────────────────

function toView(row: {
  id: string
  userId: string
  appSlug: string
  status: string
  authScheme: string
  encryptedData: string
  meta: string | null
  createdAt: Date
  updatedAt: Date
  lastRefreshAt: Date | null
  lastError: string | null
}): ConnectedAccountView {
  return {
    id: row.id,
    userId: row.userId,
    appSlug: row.appSlug,
    status: row.status as ConnectedAccountView["status"],
    authScheme: row.authScheme as ConnectedAccountView["authScheme"],
    data: decryptJson<ConnectionData>(row.encryptedData),
    meta: row.meta ? (JSON.parse(row.meta) as ConnectedAccountMeta) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRefreshAt: row.lastRefreshAt,
    lastError: row.lastError,
  }
}

/** URL de callback OAuth générique de l'instance. */
export function callbackUrl(appSlug: string): string {
  const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
  return `${base}/api/connectors/callback/${appSlug}`
}

// ─────────────────────────────────────────────────────────────
// Initiation de connexion
// ─────────────────────────────────────────────────────────────

export interface InitiateResult {
  /** URL de redirection OAuth (flux redirect) — null sinon. */
  redirectUrl: string | null
  /** Identifiant de la demande de connexion. */
  requestId: string
  /** Prochaine étape attendue (UI). */
  expect: "OAUTH_CALLBACK" | "READY" | "CREDENTIALS_FORM"
}

/**
 * Démarre une connexion :
 * - OAuth2 : crée la ConnectionRequest (state + PKCE) → URL d'autorisation ;
 * - OAuth1 : obtient un request_token signé puis URL d'autorisation ;
 * - token import / credentials : pas de redirection.
 */
export async function initiateConnection(
  userId: string,
  appSlug: string,
  redirectUri: string | null
): Promise<InitiateResult> {
  const app = getApp(appSlug)
  if (!app) throw new Error(`Application inconnue : ${appSlug}`)
  const availability = appAvailability(app)
  if (!availability.connectable) {
    throw new Error(
      `Application ${appSlug} non connectable : ${availability.reason ?? "configuration serveur absente"}`
    )
  }

  const request = await db.connectionRequest.create({
    data: {
      userId,
      appSlug,
      status: "PENDING",
      redirectUri: redirectUri,
      state: signState(`pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, userId, appSlug),
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    },
  })

  if (app.authScheme === AuthSchemeTypes.OAUTH2 && app.oauth2) {
    const pkce = app.oauth2.usePkce ? generatePkcePair() : null
    // State final : lié à la requête persistée.
    const state = signState(request.id, userId, appSlug)
    await db.connectionRequest.update({
      where: { id: request.id },
      data: {
        state,
        verifierEnc: pkce ? encryptJson({ verifier: pkce.verifier }) : null,
      },
    })
    const url = buildAuthorizeUrl({
      config: app.oauth2,
      redirectUri: callbackUrl(appSlug),
      state,
      codeChallenge: pkce?.challenge,
    })
    return { redirectUrl: url, requestId: request.id, expect: "OAUTH_CALLBACK" }
  }

  if (app.authScheme === AuthSchemeTypes.OAUTH1 && app.oauth1) {
    const requestToken = await fetchRequestToken(app.oauth1, callbackUrl(appSlug))
    const state = signState(request.id, userId, appSlug)
    await db.connectionRequest.update({
      where: { id: request.id },
      data: {
        state,
        verifierEnc: encryptJson({
          oauthToken: requestToken.oauthToken,
          oauthTokenSecret: requestToken.oauthTokenSecret,
        }),
      },
    })
    const url = buildOAuth1AuthorizeUrl(app.oauth1, requestToken)
    return { redirectUrl: url, requestId: request.id, expect: "OAUTH_CALLBACK" }
  }

  return { redirectUrl: null, requestId: request.id, expect: "CREDENTIALS_FORM" }
}

// ─────────────────────────────────────────────────────────────
// Complétion (callback OAuth)
// ─────────────────────────────────────────────────────────────

export interface CompleteResult {
  connectionId: string
  status: ConnectionStatusEnum
  /** URL de retour UI. */
  redirectUri: string | null
}

type ConnectionStatusEnum = ConnectedAccountView["status"]

/** Mappe une erreur de complétion → statut persisté. */
function failureStatus(data: ConnectionData): ConnectionData {
  return { ...data, status: ConnectionStatuses.FAILED } as ConnectionData
}

/**
 * Traite le retour OAuth2 : vérifie state, échange le code,
 * persiste la connexion chiffrée (upsert par utilisateur+app).
 */
export async function completeOAuth2(
  userId: string,
  appSlug: string,
  query: URLSearchParams
): Promise<CompleteResult> {
  const app = getApp(appSlug)
  if (!app?.oauth2) throw new Error(`App OAuth2 inconnue : ${appSlug}`)
  const state = query.get("state") ?? ""
  const code = query.get("code") ?? ""
  const error = query.get("error")

  const request = await findPendingRequest(userId, appSlug, state)
  const redirectUri = request?.redirectUri ?? null

  if (error) {
    const message = `${error}${query.get("error_description") ? `: ${query.get("error_description")}` : ""}`
    await markRequest(request, "FAILED")
    await upsertConnection(userId, appSlug, AuthScheme.OAuth2({
      error: error,
      error_description: message,
    }))
    return { connectionId: "", status: ConnectionStatuses.FAILED, redirectUri }
  }
  if (!request || !code) {
    throw new Error("Callback OAuth2 invalide : state inconnu ou code absent.")
  }

  try {
    const verifier = request.verifierEnc
      ? decryptJson<{ verifier: string }>(request.verifierEnc).verifier
      : undefined

    const data =
      appSlug === "slack"
        ? await exchangeSlackCode(app.oauth2.clientId, app.oauth2.clientSecret, code, callbackUrl(appSlug))
        : await exchangeCodeForTokens({
            config: app.oauth2,
            code,
            redirectUri: callbackUrl(appSlug),
            codeVerifier: verifier,
          })

    const meta = extractMeta(app, data)
    const connectionId = await upsertConnection(userId, appSlug, data, meta)
    await markRequest(request, "COMPLETED")
    logger.info("connectors: connexion OAuth2 établie", { userId, appSlug })
    return { connectionId, status: ConnectionStatuses.ACTIVE, redirectUri }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await upsertConnection(userId, appSlug, failureStatus(AuthScheme.OAuth2({ error: message })))
    await markRequest(request, "FAILED")
    throw err
  }
}

/** Traite le retour OAuth1 (oauth_token + oauth_verifier). */
export async function completeOAuth1(
  userId: string,
  appSlug: string,
  query: URLSearchParams
): Promise<CompleteResult> {
  const app = getApp(appSlug)
  if (!app?.oauth1) throw new Error(`App OAuth1 inconnue : ${appSlug}`)
  const oauthToken = query.get("oauth_token") ?? ""
  const oauthVerifier = query.get("oauth_verifier") ?? ""

  // OAuth1 ne renvoie pas notre state : on retrouve la requête
  // PENDING par le request_token stocké.
  const requests = await db.connectionRequest.findMany({
    where: { userId, appSlug, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 10,
  })
  let request: { id: string; redirectUri: string | null } | null = null
  let stored: { oauthToken: string; oauthTokenSecret: string } | null = null
  for (const r of requests) {
    if (!r.verifierEnc) continue
    const parsed = decryptJson<{ oauthToken: string; oauthTokenSecret: string }>(r.verifierEnc)
    if (parsed.oauthToken === oauthToken) {
      request = r
      stored = parsed
      break
    }
  }
  if (!request || !stored || !oauthVerifier) {
    throw new Error("Callback OAuth1 invalide : request token inconnu.")
  }

  try {
    const data = await exchangeRequestToken(app.oauth1, stored, oauthVerifier)
    const connectionId = await upsertConnection(userId, appSlug, data)
    await markRequest(request, "COMPLETED")
    logger.info("connectors: connexion OAuth1 établie", { userId, appSlug })
    return { connectionId, status: ConnectionStatuses.ACTIVE, redirectUri: request.redirectUri }
  } catch (err) {
    await upsertConnection(
      userId,
      appSlug,
      failureStatus(AuthScheme.OAuth1({ error: err instanceof Error ? err.message : String(err) }))
    )
    await markRequest(request, "FAILED")
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// Connexions directes (token import / identifiants)
// ─────────────────────────────────────────────────────────────

export interface DirectCredentials {
  token?: string
  username?: string
  password?: string
  /** Champs d'instance : your-domain (jira), base_url, etc. */
  fields?: Record<string, string>
}

/**
 * Établit une connexion sans redirection : import de token
 * (PAT, bot token, clé API) ou identifiants Basic + domaine.
 */
export async function connectDirectly(
  userId: string,
  appSlug: string,
  creds: DirectCredentials
): Promise<{ connectionId: string }> {
  const app = getApp(appSlug)
  if (!app) throw new Error(`Application inconnue : ${appSlug}`)
  const availability = appAvailability(app)
  if (!availability.connectable) {
    throw new Error(`Import impossible pour ${appSlug} : ${availability.reason ?? "non supporté"}`)
  }

  let data: ConnectionData
  let meta: ConnectedAccountMeta | null = null

  switch (app.authScheme) {
    case AuthSchemeTypes.BASIC: {
      if (!creds.username || !creds.password || !creds.fields?.["your-domain"]) {
        throw new Error("Jira exige email, token API et domaine Atlassian.")
      }
      const domain = creds.fields["your-domain"].replace(/^https?:\/\//, "").replace(/\.atlassian\.com$/, "")
      data = AuthScheme.Basic({
        username: creds.username,
        password: creds.password,
        base_url: `https://${domain}.atlassian.com`,
        "your-domain": domain,
      })
      meta = { accountHint: creds.username }
      break
    }
    case AuthSchemeTypes.BEARER_TOKEN: {
      if (!creds.token) throw new Error("Token requis.")
      data = AuthScheme.BearerToken({
        bearer_token: creds.token,
        ...(creds.fields?.base_url ? { base_url: creds.fields.base_url } : {}),
      })
      meta = { accountHint: hintFromToken(creds.token) }
      break
    }
    case AuthSchemeTypes.API_KEY: {
      if (!creds.token) throw new Error("Clé d'API requise.")
      data = AuthScheme.APIKey({ api_key: creds.token })
      meta = { accountHint: hintFromToken(creds.token) }
      break
    }
    case AuthSchemeTypes.OAUTH2: {
      // Import de token OAuth2 (GitHub PAT, Slack token…).
      if (!creds.token) throw new Error("Token requis.")
      data = AuthScheme.OAuth2({ access_token: creds.token })
      meta = { accountHint: hintFromToken(creds.token) }
      break
    }
    default:
      throw new Error(`Schéma ${app.authScheme} non compatible avec l'import direct.`)
  }

  const connectionId = await upsertConnection(userId, appSlug, data, meta)
  logger.info("connectors: connexion directe établie", { userId, appSlug })
  return { connectionId }
}

function hintFromToken(token: string): string {
  if (token.length <= 8) return "****"
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

// ─────────────────────────────────────────────────────────────
// Rafraîchissement (OAuth2 / Google Service Account)
// ─────────────────────────────────────────────────────────────

/**
 * Garantit un token valide : rafraîchit si expiré, dérive un token
 * de compte de service si nécessaire, persiste le résultat chiffré.
 * Retourne les données à jour (jamais stockées en clair).
 */
export async function ensureFreshConnection(
  view: ConnectedAccountView
): Promise<ConnectedAccountView> {
  const app = getApp(view.appSlug)
  if (!app) return view
  const data = view.data

  // Google Service Account : dérive un access token à la volée.
  if (data.authScheme === AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT) {
    const gsa = data as GoogleServiceAccountConnectionData
    if (!gsa.credentials_json) return view
    const notExpired =
      gsa.access_token &&
      gsa.expires_at &&
      Date.parse(gsa.expires_at) - Date.now() > 60_000
    if (notExpired) return view
    const { accessToken, expiresAt } = await googleServiceAccountAccessToken(
      gsa.credentials_json,
      app.oauth2?.scopes ?? []
    )
    const updated = { ...gsa, access_token: accessToken, expires_at: expiresAt } as ConnectionData
    await persistData(view.id, updated, { tokenExpiresAt: expiresAt })
    return { ...view, data: updated, lastRefreshAt: new Date() }
  }

  // OAuth2 avec refresh_token : rafraîchit si expiré.
  if (data.authScheme === AuthSchemeTypes.OAUTH2 && app.oauth2) {
    const oauth2Data = data as OAuth2ConnectionData
    if (!isTokenExpired(oauth2Data) || !oauth2Data.refresh_token) return view
    try {
      const refreshed = await refreshAccessToken(app.oauth2, oauth2Data)
      if (refreshed) {
        const meta: ConnectedAccountMeta = {
          scopes: refreshed.scope ?? null,
          tokenExpiresAt: refreshed.expires_at ?? null,
        }
        await persistData(view.id, refreshed, meta, new Date())
        logger.info("connectors: token rafraîchi", { appSlug: view.appSlug, userId: view.userId })
        return { ...view, data: refreshed, meta, lastRefreshAt: new Date() }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Statut EXPIRED : l'utilisateur doit reconnecter.
      await persistData(view.id, { ...(data as OAuth2ConnectionData), status: ConnectionStatuses.EXPIRED } as ConnectionData, undefined, undefined, message)
      logger.warn("connectors: rafraîchissement échoué", { appSlug: view.appSlug, error: message })
      throw new Error(`Token expiré et non rafraîchissable (${view.appSlug}) : ${message}`)
    }
  }
  return view
}

// ─────────────────────────────────────────────────────────────
// Lecture / suppression
// ─────────────────────────────────────────────────────────────

/** Liste les connexions d'un utilisateur (secrets déchiffrés, usage serveur). */
export async function listConnections(userId: string): Promise<ConnectedAccountView[]> {
  const rows = await db.connectedAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
  // Rotation paresseuse : les secrets encore en v1/clé non active sont
  // re-chiffrés avec la clé active (best-effort, jamais bloquant).
  for (const row of rows) void lazyRotateSecret(row)
  return rows.map(toView)
}

/** Récupère la connexion ACTIVE d'un utilisateur pour une app. */
export async function getActiveConnection(
  userId: string,
  appSlug: string
): Promise<ConnectedAccountView | null> {
  const row = await db.connectedAccount.findFirst({
    where: { userId, appSlug, status: ConnectionStatuses.ACTIVE },
  })
  if (!row) return null
  void lazyRotateSecret(row)
  return toView(row)
}

/**
 * v3.6 — re-chiffrement paresseux d'un secret avec la clé active.
 * Appelé à chaque lecture : la rotation de CONNECTORS_ENCRYPTION_KEY
 * migre les données SANS downtime ni batch bloquant.
 */
async function lazyRotateSecret(row: { id: string; encryptedData: string }): Promise<void> {
  try {
    if (!needsRotation(row.encryptedData)) return
    const data = decryptJson<ConnectionData>(row.encryptedData)
    await db.connectedAccount.update({
      where: { id: row.id },
      data: { encryptedData: encryptJson(data) },
    })
    logger.info("connectors: secret re-chiffré avec la clé active (rotation paresseuse)", {
      connectionId: row.id,
    })
  } catch (err) {
    logger.warn("connectors: rotation paresseuse impossible (non bloquant)", {
      connectionId: row.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Révoque et supprime une connexion (appel réseau best-effort). */
export async function deleteConnection(userId: string, connectionId: string): Promise<boolean> {
  const row = await db.connectedAccount.findFirst({ where: { id: connectionId, userId } })
  if (!row) return false
  const view = toView(row)
  const app = getApp(view.appSlug)
  if (app?.oauth2 && view.data.authScheme === AuthSchemeTypes.OAUTH2) {
    const token = (view.data as OAuth2ConnectionData).access_token
    if (token) await revokeToken(app.oauth2, token).catch(() => false)
  }
  await db.connectedAccount.delete({ where: { id: connectionId } })
  logger.info("connectors: connexion supprimée", { userId, appSlug: view.appSlug })
  return true
}

// ─────────────────────────────────────────────────────────────
// Internes
// ─────────────────────────────────────────────────────────────

async function findPendingRequest(userId: string, appSlug: string, state: string) {
  const requestId = verifyState(state, userId, appSlug)
  if (!requestId) return null
  const request = await db.connectionRequest.findFirst({
    where: { id: requestId, userId, appSlug, status: "PENDING", expiresAt: { gt: new Date() } },
  })
  return request
}

async function markRequest(
  request: { id: string } | null,
  status: "COMPLETED" | "FAILED" | "EXPIRED"
): Promise<void> {
  if (!request) return
  await db.connectionRequest.update({ where: { id: request.id }, data: { status } }).catch(() => undefined)
}

async function upsertConnection(
  userId: string,
  appSlug: string,
  data: ConnectionData,
  meta: ConnectedAccountMeta | null = null
): Promise<string> {
  const encrypted = encryptJson(data)
  const row = await db.connectedAccount.upsert({
    where: { userId_appSlug: { userId, appSlug } },
    create: {
      userId,
      appSlug,
      status: data.status,
      authScheme: data.authScheme,
      encryptedData: encrypted,
      meta: meta ? JSON.stringify(meta) : null,
      lastError: null,
    },
    update: {
      status: data.status,
      authScheme: data.authScheme,
      encryptedData: encrypted,
      meta: meta ? JSON.stringify(meta) : null,
      lastError: null,
    },
  })
  return row.id
}

async function persistData(
  connectionId: string,
  data: ConnectionData,
  meta?: ConnectedAccountMeta | null,
  lastRefreshAt?: Date,
  error?: string
): Promise<void> {
  await db.connectedAccount.update({
    where: { id: connectionId },
    data: {
      status: data.status,
      authScheme: data.authScheme,
      encryptedData: encryptJson(data),
      ...(meta !== undefined ? { meta: meta ? JSON.stringify(meta) : null } : {}),
      ...(lastRefreshAt ? { lastRefreshAt } : {}),
      ...(error !== undefined ? { lastError: error } : {}),
    },
  })
}

/** Extrait les métadonnées non sensibles d'un échange OAuth2. */
function extractMeta(_app: AppDefinition, data: OAuth2ConnectionData): ConnectedAccountMeta {
  return {
    scopes: data.scope ?? null,
    tokenExpiresAt: data.expires_at ?? null,
  }
}
