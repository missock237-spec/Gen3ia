/**
 * Moteur d'exécution d'actions — équivalent local de l'exécution
 * distante des tools Composio : prend une ActionSpec déclarative,
 * des paramètres et une ConnectionData ; construit la requête HTTP
 * réelle (path params, query, body, injection d'identifiants,
 * signature OAuth1 par requête) et normalise la réponse.
 *
 * Aucun mock : chaque exécution aboutit à un appel réseau réel
 * vers l'API publique de l'application cible.
 */

import { buildOAuth1Header } from "./oauth1"
import { isTokenExpired } from "./oauth2"
import {
  AuthSchemeTypes,
  ConnectionStatuses,
  type ActionExecutionResponse,
  type ActionParam,
  type ActionSpec,
  type AppDefinition,
  type AuthInjectionStyle,
  type ConnectionData,
  type OAuth1ConnectionData,
  type OAuth2ConnectionData,
} from "./types"

const DEFAULT_MAX_OUTPUT = 6000
const REQUEST_TIMEOUT_MS = 30_000

export class ConnectorExecutionError extends Error {
  constructor(
    message: string,
    public readonly appSlug: string,
    public readonly actionSlug: string,
    public readonly httpStatus?: number
  ) {
    super(message)
    this.name = "ConnectorExecutionError"
  }
}

// ─────────────────────────────────────────────────────────────
// Validation et typage des paramètres
// ─────────────────────────────────────────────────────────────

/** Coerce et valide une valeur selon le type déclaré du paramètre. */
function coerceParam(param: ActionParam, value: unknown): unknown {
  if (value === undefined || value === null || value === "") {
    if (param.default !== undefined) return param.default
    if (param.required) {
      throw new ConnectorExecutionError(
        `Paramètre requis manquant : « ${param.name} » (${param.description}).`,
        "",
        param.name
      )
    }
    return ""
  }
  switch (param.type) {
    case "integer":
    case "number": {
      const n = typeof value === "number" ? value : Number(value)
      if (Number.isNaN(n)) {
        throw new ConnectorExecutionError(
          `Paramètre « ${param.name} » doit être numérique (reçu : ${JSON.stringify(value)}).`,
          "",
          param.name
        )
      }
      return param.type === "integer" ? Math.trunc(n) : n
    }
    case "boolean": {
      if (typeof value === "boolean") return value
      const s = String(value).toLowerCase()
      if (["true", "1", "yes"].includes(s)) return true
      if (["false", "0", "no"].includes(s)) return false
      throw new ConnectorExecutionError(
        `Paramètre « ${param.name} » doit être booléen.`,
        "",
        param.name
      )
    }
    case "enum": {
      const s = String(value)
      if (param.enum && !param.enum.includes(s)) {
        throw new ConnectorExecutionError(
          `Paramètre « ${param.name} » : valeur « ${s} » hors énumération [${param.enum.join(", ")}].`,
          "",
          param.name
        )
      }
      return s
    }
    case "array":
    case "object": {
      if (typeof value === "string") {
        try {
          return JSON.parse(value) as unknown
        } catch {
          if (param.type === "array") return value.split(",").map((x) => x.trim())
          throw new ConnectorExecutionError(
            `Paramètre « ${param.name} » doit être un JSON valide.`,
            "",
            param.name
          )
        }
      }
      return value as unknown
    }
    default:
      return String(value)
  }
}

// ─────────────────────────────────────────────────────────────
// Extraction du token effectif selon le schéma
// ─────────────────────────────────────────────────────────────

/**
 * Token à injecter. Priorité : token utilisateur (Slack authed_user)
 * > access_token OAuth2 > oauth_token OAuth1 > api_key / bearer.
 */
export function effectiveToken(data: ConnectionData): string | null {
  switch (data.authScheme) {
    case AuthSchemeTypes.OAUTH2:
      return data.authed_user?.access_token ?? data.access_token ?? null
    case AuthSchemeTypes.OAUTH1:
      return data.oauth_token ?? null
    case AuthSchemeTypes.API_KEY:
      return data.api_key ?? null
    case AuthSchemeTypes.BEARER_TOKEN:
      return data.bearer_token ?? null
    case AuthSchemeTypes.BASIC:
      return data.username && data.password
        ? Buffer.from(`${data.username}:${data.password}`).toString("base64")
        : null
    case AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT:
      return data.access_token ?? null // token dérivé en amont
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────
// Construction de la requête
// ─────────────────────────────────────────────────────────────

export interface BuiltRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/** Résout {{token}} dans un template d'injection. */
function resolveTemplate(template: string, token: string): string {
  return template.replace(/\{\{\s*token\s*\}\}/g, token)
}

/**
 * Construit la requête HTTP complète à partir de la spec, des
 * paramètres validés et des identifiants. Le baseUrl de l'app peut
 * être surchargé par data.base_url (instances self-hosted).
 *
 * Ordre : (1) validation/coercition des params déclarés,
 * (2) hook `prepare` éventuel → params HTTP finaux, (3) répartition
 * path/query/header/body, (4) injection des identifiants, (5) body.
 */
export function buildRequest(
  app: AppDefinition,
  action: ActionSpec,
  data: ConnectionData,
  params: Record<string, unknown>
): BuiltRequest {
  // 1. Validation et coercition selon le schéma déclaré.
  const coerced: Record<string, unknown> = {}
  for (const p of action.params) {
    const v = coerceParam(p, params[p.name])
    if (v !== "" && v !== undefined && v !== null) coerced[p.name] = v
  }

  // 2. Hook prepare : transformations spécifiques (RFC 2822, GraphQL…).
  const httpParams: Record<string, unknown> = action.prepare
    ? action.prepare(coerced, data)
    : coerced

  // 3. Répartition dans les emplacements. Les clés produites par
  // `prepare` non déclarées vont dans le corps (convention dominante).
  const pathParams: Record<string, string> = {}
  const queryParams: Record<string, string> = {}
  const headerParams: Record<string, string> = {}
  const bodyParams: Record<string, unknown> = {}
  const declared = new Map(action.params.map((p) => [p.name, p] as const))

  for (const [k, v] of Object.entries(httpParams)) {
    if (v === undefined || v === null || v === "") continue
    const slot = declared.get(k)?.in ?? "body"
    switch (slot) {
      case "path":
        pathParams[k] = String(v)
        break
      case "query":
        queryParams[k] = typeof v === "object" ? JSON.stringify(v) : String(v)
        break
      case "header":
        headerParams[k] = String(v)
        break
      default:
        bodyParams[k] = v
    }
  }

  // 4. URL : baseUrl (surchargeable) + path avec params encodés.
  const baseUrl = data.base_url?.replace(/\/+$/, "") ?? app.baseUrl
  let path = action.path
  for (const [k, v] of Object.entries(pathParams)) {
    // Encodage segment-safe : les slashes restent (scopes Slack…).
    path = path.replace(new RegExp(`\\{${k}\\}`, "g"), encodeURIComponent(v))
  }
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`)
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v)

  // 2. En-têtes.
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "GEN3IA-Connectors/1.0",
    ...(action.headers ?? {}),
    ...headerParams,
  }

  // 3. Body (POST/PUT/PATCH/DELETE).
  let body: string | undefined
  const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(action.method) &&
    (Object.keys(bodyParams).length > 0 || action.method !== "DELETE")

  // 4. Injection des identifiants.
  const auth: AuthInjectionStyle = action.auth ?? { style: "bearer" }
  const token = effectiveToken(data)

  if (auth.style === "none") {
    // pas d'auth
  } else if (auth.style === "oauth1") {
    if (data.authScheme !== AuthSchemeTypes.OAUTH1 || !data.oauth_token) {
      throw new ConnectorExecutionError(
        `Action ${action.slug} requiert une connexion OAuth1 active.`,
        app.slug,
        action.slug
      )
    }
    if (!app.oauth1) {
      throw new ConnectorExecutionError(
        `L'application ${app.slug} n'expose pas de configuration OAuth1.`,
        app.slug,
        action.slug
      )
    }
    const oauth1 = data as OAuth1ConnectionData
    const merged = { ...queryParams, ...bodyParams } as Record<string, string>
    headers.Authorization = buildOAuth1Header(action.method, url.toString(), {
      consumerKey: app.oauth1.consumerKey,
      consumerSecret: app.oauth1.consumerSecret,
      oauthToken: oauth1.oauth_token,
      oauthTokenSecret: oauth1.oauth_token_secret,
      extraParams: merged,
    })
  } else {
    if (!token) {
      throw new ConnectorExecutionError(
        `Aucun identifiant injectable pour la connexion ${app.slug} (schéma ${data.authScheme}, statut ${data.status}).`,
        app.slug,
        action.slug
      )
    }
    switch (auth.style) {
      case "bearer":
        headers.Authorization = `Bearer ${token}`
        break
      case "basic":
        headers.Authorization = `Basic ${token}`
        break
      case "header":
        headers[auth.name] = resolveTemplate(auth.template, token)
        break
      case "query":
        url.searchParams.set(auth.name, resolveTemplate(auth.template, token))
        break
      case "body":
        if (hasBody) {
          bodyParams[auth.path ?? "token"] = token
        }
        break
      case "pathPrefix": {
        // Telegram : le token est un segment du chemin (/bot<token>/…).
        const prefix = resolveTemplate(auth.template, token)
        url.pathname = `${prefix.replace(/\/+$/, "")}/${url.pathname.replace(/^\/+/, "")}`
        break
      }
    }
  }

  // 5. Sérialisation du body.
  if (hasBody && Object.keys(bodyParams).length > 0) {
    if ((action.bodyContentType ?? "json") === "json") {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(bodyParams)
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded"
      const form = new URLSearchParams()
      for (const [k, v] of Object.entries(bodyParams)) {
        form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v))
      }
      body = form.toString()
    }
  } else if (hasBody && ["POST", "PUT", "PATCH"].includes(action.method)) {
    // Body vide explicite (certaines APIs l'exigent).
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
    body = "{}"
  }

  return { url: url.toString(), method: action.method, headers, body }
}

// ─────────────────────────────────────────────────────────────
// Exécution réseau + normalisation
// ─────────────────────────────────────────────────────────────

/** Sérialise une réponse en texte pour le contexte LLM. */
export function serializeResponse(data: unknown, maxChars: number): string {
  let text: string
  if (typeof data === "string") {
    text = data
  } else {
    try {
      text = JSON.stringify(data, null, 2)
    } catch {
      text = String(data)
    }
  }
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars)}\n… (tronqué : ${text.length} caractères au total)`
  }
  return text
}

/**
 * Exécute une action : réseau réel, gestion d'erreur structurée.
 * `on401` permet au service amont de rafraîchir le token puis de
 * rejouer la requête une fois (retry unique).
 */
export async function executeHttpRequest(
  app: AppDefinition,
  action: ActionSpec,
  data: ConnectionData,
  params: Record<string, unknown>,
  opts: { connectionId: string; on401?: () => Promise<ConnectionData | null> }
): Promise<ActionExecutionResponse> {
  const started = Date.now()
  const maxChars = action.maxOutputChars ?? DEFAULT_MAX_OUTPUT

  const runOnce = async (
    connData: ConnectionData
  ): Promise<{ res: Response; req: BuiltRequest }> => {
    const req = buildRequest(app, action, connData, params)
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    })
    return { res, req }
  }

  try {
    let { res } = await runOnce(data)

    // Retry unique après refresh si 401 + refresh_token disponible.
    if (res.status === 401 && opts.on401 && data.authScheme === AuthSchemeTypes.OAUTH2) {
      const refreshed = await opts.on401()
      if (refreshed) {
        const retry = await runOnce(refreshed)
        res = retry.res
      }
    }

    const contentType = res.headers.get("content-type") ?? ""
    let parsed: unknown
    if (contentType.includes("json")) {
      parsed = await res.json().catch(() => ({}))
    } else {
      const text = await res.text()
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }

    const latencyMs = Date.now() - started
    const output = serializeResponse(parsed, maxChars)

    // Slack renvoie 200 avec ok=false : normalisation d'erreur.
    const slackFailure =
      typeof parsed === "object" && parsed !== null && "ok" in parsed && (parsed as { ok: boolean }).ok === false

    return {
      ok: res.ok && !slackFailure,
      status: res.status,
      statusText: res.statusText,
      data: parsed,
      output,
      latencyMs,
      error: res.ok && !slackFailure ? undefined : extractErrorMessage(parsed) ?? `HTTP ${res.status}`,
      connectionId: opts.connectionId,
      actionSlug: action.slug,
      appSlug: app.slug,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ConnectorExecutionError(
      message,
      app.slug,
      action.slug
    )
  }
}

/** Extrait un message d'erreur structuré des conventions communes. */
function extractErrorMessage(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined
  const d = data as Record<string, unknown>
  if (typeof d.error === "string") return d.error
  if (typeof d.error === "object" && d.error !== null) {
    const e = d.error as Record<string, unknown>
    if (typeof e.message === "string") return e.message
  }
  if (typeof d.message === "string") return d.message
  if (typeof d.error_description === "string") return d.error_description
  return undefined
}

/** Vérifie qu'une connexion est exécutable (ACTIVE, non expirée). */
export function assertExecutableConnection(
  data: ConnectionData
): { ok: true } | { ok: false; reason: string } {
  if (data.status !== ConnectionStatuses.ACTIVE) {
    return { ok: false, reason: `Connexion ${data.status} (reconnectez l'application).` }
  }
  if (data.authScheme === AuthSchemeTypes.OAUTH2 && isTokenExpired(data as OAuth2ConnectionData)) {
    return { ok: false, reason: "Token expiré : rafraîchissement requis." }
  }
  return { ok: true }
}
