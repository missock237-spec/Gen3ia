import { AppError } from "@/lib/errors"
import { getBreaker } from "@/lib/reliability/breaker"
import { logger } from "@/lib/observability/logger"
import type {
  AuthConfigItem,
  AuthConfigListResponse,
  ConnectedAccountItem,
  ConnectedAccountListParams,
  ConnectedAccountListResponse,
  LinkCreateParams,
  LinkCreateResponse,
  ToolExecuteParams,
  ToolExecuteResponse,
  ToolItem,
  ToolListParams,
  ToolListResponse,
  ToolkitItem,
  ToolkitListParams,
  ToolkitListResponse,
} from "./types"

/**
 * Client HTTP Composio API v3.1 — implémentation TypeScript native de GEN3IA
 * (même contrat que le SDK officiel @composio/client analysé dans
 * ComposioHQ/composio, sans sa couche Effect/nocturne : ici fetch natif,
 * compatible serverless Vercel).
 *
 * Configuration :
 *   COMPOSIO_API_KEY  — clé API du projet Composio (dashboard.composio.dev)
 *   COMPOSIO_BASE_URL — défaut https://backend.composio.dev (self-host possible)
 *
 * Authentification : en-tête `x-api-key`.
 * Résilience : circuit breaker partagé `composio` (cf. ADR-0010) + timeouts.
 * Erreurs : AppError typées du catalogue (CONNECTOR_*).
 */

const DEFAULT_BASE_URL = "https://backend.composio.dev"
const REQUEST_TIMEOUT_MS = 30_000

export function composioApiKey(): string | null {
  const key = process.env.COMPOSIO_API_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

export function composioBaseUrl(): string {
  return (process.env.COMPOSIO_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "")
}

/** Le connecteur est-il actif sur ce déploiement ? */
export function isComposioConfigured(): boolean {
  return composioApiKey() !== null
}

/** Identifiant utilisateur côté Composio — namespacé GEN3IA, stable. */
export function composioUserId(userId: string): string {
  return `g3ia_${userId}`
}

// ---------- Erreurs ----------

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`)
  }
}

/** Traduit une réponse HTTP en erreur Composio (échec du breaker). */
function toConnectorError(err: unknown): AppError {
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) {
      return new AppError("CONNECTOR_AUTH_FAILED", {
        detail: `Composio HTTP ${err.status} : ${err.body.slice(0, 300)}`,
      })
    }
    if (err.status === 429) {
      const retry = new AppError("CONNECTOR_RATE_LIMITED", {
        detail: `Composio HTTP 429 : ${err.body.slice(0, 300)}`,
      })
      ;(retry as AppError & { retryAfter?: number }).retryAfter = 30
      return retry
    }
    if (err.status === 404) {
      return new AppError("CONNECTOR_NOT_FOUND", {
        message: "Application ou action Composio introuvable.",
        detail: `HTTP 404 : ${err.body.slice(0, 300)}`,
      })
    }
    return new AppError("CONNECTOR_ACTION_FAILED", {
      detail: `Composio HTTP ${err.status} : ${err.body.slice(0, 300)}`,
    })
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (/timeout|abort|fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(msg)) {
    return new AppError("CONNECTOR_UNREACHABLE", { detail: msg })
  }
  return new AppError("CONNECTOR_ACTION_FAILED", { detail: msg })
}

// ---------- Noyau HTTP ----------

async function composioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = composioApiKey()
  if (!apiKey) {
    throw new AppError("CONNECTOR_NOT_CONFIGURED")
  }
  let response: Response
  try {
    response = await getBreaker("composio").run(() =>
      fetch(`${composioBaseUrl()}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    )
  } catch (err) {
    // Le breaker rejette avec l'erreur d'origine : on la traduit.
    if (err instanceof AppError) throw err
    throw toConnectorError(err)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw toConnectorError(new HttpError(response.status, body))
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new AppError("CONNECTOR_ACTION_FAILED", {
      message: "Réponse Composio illisible (JSON invalide).",
      detail: `path=${path}`,
    })
  }
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ""
}

// ---------- Toolkits (applications, 1000+) ----------

export async function listToolkits(params: ToolkitListParams = {}): Promise<ToolkitListResponse> {
  return composioFetch<ToolkitListResponse>(`/api/v3.1/toolkits${qs(params as Record<string, unknown>)}`)
}

export async function getToolkit(slug: string): Promise<ToolkitItem> {
  const res = await composioFetch<{ items?: ToolkitItem[] } & ToolkitItem>(
    `/api/v3.1/toolkits${qs({ search: slug, limit: 1 })}`
  )
  // Certains déploiements renvoient directement l'objet, d'autres une page.
  const direct = res as ToolkitItem
  if (direct?.slug && direct.slug === slug) return direct
  const item = (res as { items?: ToolkitItem[] }).items?.find((t) => t.slug === slug)
  if (item) return item
  throw new AppError("CONNECTOR_NOT_FOUND", {
    message: `Application « ${slug} » introuvable dans le catalogue Composio.`,
    detail: `toolkit=${slug}`,
  })
}

export async function listToolkitCategories(): Promise<string[]> {
  const res = await composioFetch<{ items?: Array<{ name?: string; [k: string]: unknown }> }>(
    "/api/v3.1/toolkits/categories"
  )
  return (res.items ?? [])
    .map((c) => (typeof c.name === "string" ? c.name : ""))
    .filter((name) => name.length > 0)
}

// ---------- Tools (actions) ----------

export async function listTools(params: ToolListParams = {}): Promise<ToolListResponse> {
  const query = qs({
    toolkit: params.toolkit,
    query: params.query,
    limit: params.limit,
    cursor: params.cursor,
    important: params.important,
    include_deprecated: params.include_deprecated,
  })
  return composioFetch<ToolListResponse>(`/api/v3.1/tools${query}`)
}

export async function getTool(slug: string): Promise<ToolItem> {
  // Le point d'entrée de détail est GET /api/v3.1/tools/{slug}.
  try {
    return await composioFetch<ToolItem>(`/api/v3.1/tools/${encodeURIComponent(slug)}`)
  } catch (err) {
    if (err instanceof AppError && err.code === "CONNECTOR_NOT_FOUND") {
      // Certains déploiements n'exposent pas le retrieve direct : repli sur
      // la recherche exacte par slug.
      const res = await listTools({ query: slug, limit: 20 })
      const item = res.items.find((t) => t.slug.toUpperCase() === slug.toUpperCase())
      if (item) return item
      throw new AppError("CONNECTOR_NOT_FOUND", {
        message: `Action « ${slug} » introuvable.`,
        detail: `tool=${slug}`,
      })
    }
    throw err
  }
}

// ---------- Auth configs ----------

export async function listAuthConfigs(toolkitSlug: string): Promise<AuthConfigItem[]> {
  const res = await composioFetch<AuthConfigListResponse>(
    `/api/v3.1/auth_configs${qs({ toolkit_slug: toolkitSlug, limit: 50 })}`
  )
  return res.items ?? []
}

/**
 * Crée une auth config « Composio-managed » : Composio prête ses propres
 * clients OAuth pour les apps populaires — même body que AuthConfigs.create()
 * du SDK officiel : { toolkit: { slug }, auth_config: { type, name } }.
 */
export async function createManagedAuthConfig(toolkitSlug: string, toolkitName: string): Promise<string> {
  const res = await composioFetch<{ id?: string } & AuthConfigItem>("/api/v3.1/auth_configs", {
    method: "POST",
    body: JSON.stringify({
      toolkit: { slug: toolkitSlug },
      auth_config: {
        type: "use_composio_managed_auth",
        name: `${toolkitName} Auth Config`,
      },
    }),
  })
  const id = (res as { id?: string }).id
  if (!id) {
    throw new AppError("CONNECTOR_ACTION_FAILED", {
      message: "Impossible de créer la configuration d'authentification Composio.",
      detail: `toolkit=${toolkitSlug} réponse=${JSON.stringify(res).slice(0, 300)}`,
    })
  }
  return id
}

// ---------- Connexions ----------

export async function initiateLink(params: LinkCreateParams): Promise<LinkCreateResponse> {
  return composioFetch<LinkCreateResponse>("/api/v3.1/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: params.auth_config_id,
      user_id: params.user_id,
      ...(params.alias ? { alias: params.alias } : {}),
      ...(params.callback_url ? { callback_url: params.callback_url } : {}),
    }),
  })
}

export async function listConnectedAccounts(
  params: ConnectedAccountListParams = {}
): Promise<ConnectedAccountListResponse> {
  return composioFetch<ConnectedAccountListResponse>(
    `/api/v3.1/connected_accounts${qs(params as Record<string, unknown>)}`
  )
}

export async function getConnectedAccount(composioId: string): Promise<ConnectedAccountItem> {
  return composioFetch<ConnectedAccountItem>(
    `/api/v3.1/connected_accounts/${encodeURIComponent(composioId)}`
  )
}

export async function deleteConnectedAccount(composioId: string): Promise<void> {
  await composioFetch<unknown>(
    `/api/v3.1/connected_accounts/${encodeURIComponent(composioId)}`,
    { method: "DELETE" }
  )
}

// ---------- Exécution ----------

export async function executeTool(
  slug: string,
  params: ToolExecuteParams
): Promise<ToolExecuteResponse> {
  const res = await composioFetch<ToolExecuteResponse>(
    `/api/v3.1/tools/execute/${encodeURIComponent(slug)}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(params.arguments ? { arguments: params.arguments } : {}),
        ...(params.connected_account_id ? { connected_account_id: params.connected_account_id } : {}),
        ...(params.user_id ? { user_id: params.user_id } : {}),
      }),
    }
  )
  if (!res.successful && res.error) {
    logger.warn("composio: exécution d'action échouée", {
      tool: slug,
      error: res.error.slice(0, 300),
      logId: res.log_id,
    })
  }
  return res
}
