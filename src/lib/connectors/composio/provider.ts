/**
 * GEN3IA × Composio — provider d'opérations (côté serveur).
 *
 * Pont entre le moteur de connecteurs GEN3IA et la plateforme hébergée
 * Composio (SDK `@composio/core`) :
 * - catalogue live des toolkits gérés Composio (cache 10 min) ;
 * - autorisation one-click (`toolkits.authorize` → redirectUrl, OAuth
 *   opéré par Composio — aucun client-id local requis) ;
 * - comptes connectés (vue SANITISÉE : aucun secret ne traverse) ;
 * - exécution d'outils pour les agents (`tools.execute`) ;
 * - exposition des outils des apps connectées au registre d'outils
 *   GEN3IA (format ConnectorTool, schéma JSON converti).
 *
 * Priorité d'exécution : connexion LOCALE GEN3IA d'abord, connexion
 * hébergée Composio ensuite (voir core/toolset.ts — executeAction).
 */

import { logger } from "@/lib/observability/logger"
import { startSpan as otelStart, endSpan as otelEnd } from "@/lib/observability/otel"
import { composioManagedSlugs, getCatalogApp } from "../catalog"
import {
  connectorToolKey,
  type ConnectorTool,
  type ActionExecutionResponse,
} from "../core/types"
import { ConnectorExecutionError } from "../core/executor"
import {
  composioErrorMessage,
  composioRequestOptions,
  composioUserId,
  getComposioClient,
  resolveComposioKey,
} from "./client"

// Ré-export (point d'entrée unique côté routes) :
export { isComposioConfigured } from "./client"

// ─────────────────────────────────────────────────────────────
// Types de vues (sanitisées — jamais de secret)
// ─────────────────────────────────────────────────────────────

/** Vue publique d'un compte connecté hébergé Composio. */
export interface ComposioConnectionView {
  /** Préfixé `cpc_` pour distinguer des connexions locales. */
  id: string
  appSlug: string
  appName: string
  status: string
  active: boolean
  accountHint: string | null
  createdAt: string
  lastError: string | null
}

/** Statut global de l'intégration Composio. */
export interface ComposioStatus {
  configured: boolean
  source: "env" | "db" | null
  /** Toolkits connectables en un clic (comptage live si disponible). */
  toolkitCount: number
  /** Origine du comptage : live (API) ou statique (catalogue public). */
  toolkitSource: "live" | "static"
  liveError: string | null
}

// ─────────────────────────────────────────────────────────────
// Cache des toolkits Composio (live, TTL 10 min)
// ─────────────────────────────────────────────────────────────

const TOOLKITS_TTL_MS = 10 * 60 * 1000
const TOOLKITS_CACHE: {
  slugs: Set<string> | null
  at: number
  error: string | null
  loading: Promise<void> | null
} = { slugs: null, at: 0, error: null, loading: null }

/** Invalide tous les caches du provider (rotation de clé admin). */
export function invalidateComposioCaches(): void {
  TOOLKITS_CACHE.slugs = null
  TOOLKITS_CACHE.at = 0
  TOOLKITS_CACHE.error = null
  CONNECTIONS_CACHE.clear()
  TOOLS_CACHE.clear()
}

/**
 * Charge la liste live des toolkits gérés par Composio
 * (`toolkits.list({ managedBy: "composio" })`), avec pagination
 * curseur jusqu'à 1000 toolkits. TTL 10 min, promesse dédupliquée.
 */
export async function ensureComposioToolkits(): Promise<void> {
  if (TOOLKITS_CACHE.slugs && Date.now() - TOOLKITS_CACHE.at < TOOLKITS_TTL_MS) return
  if (TOOLKITS_CACHE.loading) return TOOLKITS_CACHE.loading

  TOOLKITS_CACHE.loading = (async () => {
    const client = await getComposioClient()
    if (!client) return
    try {
      // `toolkits.get(query)` (surcharge liste) renvoie un TABLEAU direct de toolkits.
      const items = await client.toolkits.get(
        { managedBy: "composio", limit: 1000 },
        composioRequestOptions()
      )
      const slugs = new Set<string>()
      for (const item of items) {
        if (item?.slug) slugs.add(item.slug)
      }
      TOOLKITS_CACHE.slugs = slugs
      TOOLKITS_CACHE.at = Date.now()
      TOOLKITS_CACHE.error = null
      logger.info("composio: toolkits managés chargés", { count: slugs.size })
    } catch (err) {
      // La liste live échoue (quota, réseau) : repli statique, non bloquant.
      TOOLKITS_CACHE.error = composioErrorMessage(err)
      TOOLKITS_CACHE.at = Date.now()
      logger.warn("composio: liste live des toolkits inaccessible", {
        error: TOOLKITS_CACHE.error,
      })
    } finally {
      TOOLKITS_CACHE.loading = null
    }
  })()
  return TOOLKITS_CACHE.loading
}

/**
 * Un slug est-il connectable via Composio (un clic, OAuth managé) ?
 * Synchrone : live si chargé, sinon base statique du catalogue public.
 */
export function composioConnectable(appSlug: string): boolean {
  const live = TOOLKITS_CACHE.slugs
  if (live && live.size > 0) return live.has(appSlug)
  return composioManagedSlugs().has(appSlug)
}

/** Statut global de l'intégration (comptage live ou statique). */
export async function composioStatus(): Promise<ComposioStatus> {
  const { key, source } = await resolveComposioKey()
  if (!key) {
    return {
      configured: false,
      source: null,
      toolkitCount: 0,
      toolkitSource: "static",
      liveError: null,
    }
  }
  await ensureComposioToolkits().catch(() => undefined)
  const live = TOOLKITS_CACHE.slugs
  if (live && live.size > 0) {
    return {
      configured: true,
      source,
      toolkitCount: live.size,
      toolkitSource: "live",
      liveError: TOOLKITS_CACHE.error,
    }
  }
  return {
    configured: true,
    source,
    toolkitCount: composioManagedSlugs().size,
    toolkitSource: "static",
    liveError: TOOLKITS_CACHE.error,
  }
}

// ─────────────────────────────────────────────────────────────
// Autorisation one-click
// ─────────────────────────────────────────────────────────────

export interface ComposioAuthorizeResult {
  redirectUrl: string | null
  requestId: string
  status: string
}

/**
 * Démarre la connexion d'une app via Composio :
 * `toolkits.authorize` crée/réutilise la config d'auth managée et
 * renvoie l'URL d'autorisation hébergée (l'utilisateur autorise son
 * compte, Composio gère l'OAuth de bout en bout, aucun secret ne
 * transite par GEN3IA).
 */
export async function authorizeComposioApp(
  userId: string,
  appSlug: string
): Promise<ComposioAuthorizeResult> {
  const client = await getComposioClient()
  if (!client) {
    throw new ConnectorExecutionError(
      "Intégration Composio non configurée (COMPOSIO_API_KEY absente).",
      appSlug,
      "authorize"
    )
  }
  try {
    const request = await client.toolkits.authorize(
      composioUserId(userId),
      appSlug,
      undefined,
      composioRequestOptions()
    )
    logger.info("composio: autorisation initiée", { userId, appSlug, requestId: request.id })
    return {
      redirectUrl: request.redirectUrl ?? null,
      requestId: request.id,
      status: request.status ?? "INITIATED",
    }
  } catch (err) {
    throw new ConnectorExecutionError(
      `Autorisation Composio impossible pour « ${appSlug} » : ${composioErrorMessage(err)}`,
      appSlug,
      "authorize"
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Comptes connectés (vues sanitisées, cache 30 s/utilisateur)
// ─────────────────────────────────────────────────────────────

const CONNECTIONS_TTL_MS = 30_000
const CONNECTIONS_CACHE = new Map<string, { views: ComposioConnectionView[]; at: number }>()

/** Mappe un statut Composio vers un statut GEN3IA. */
function mapStatus(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "ACTIVE"
    case "INITIALIZING":
    case "INITIATED":
      return "INITIATED"
    case "FAILED":
      return "FAILED"
    case "EXPIRED":
    case "INACTIVE":
      return "EXPIRED"
    case "REVOKED":
      return "REVOKED"
    default:
      return "INITIATED"
  }
}

/** Liste les comptes connectés Composio de l'utilisateur (sanitisée). */
export async function listComposioConnections(
  userId: string
): Promise<ComposioConnectionView[]> {
  const client = await getComposioClient()
  if (!client) return []

  const cached = CONNECTIONS_CACHE.get(userId)
  if (cached && Date.now() - cached.at < CONNECTIONS_TTL_MS) return cached.views

  try {
    // `connectedAccounts.list` renvoie { items } (pas de pagination curseur).
    const res = await client.connectedAccounts.list(
      { userIds: [composioUserId(userId)], limit: 100 },
      composioRequestOptions()
    )
    let views: ComposioConnectionView[] = []
    for (const item of res.items) {
      const appSlug = item.toolkit?.slug ?? "unknown"
      views.push({
        id: `cpc_${item.id}`,
        appSlug,
        appName: getCatalogApp(appSlug)?.name ?? appSlug,
        status: mapStatus(item.status),
        active: item.status === "ACTIVE" && !item.isDisabled,
        accountHint: item.alias ?? item.id.slice(0, 8),
        createdAt: item.createdAt,
        lastError: item.statusReason,
      })
    }
    // Une seule connexion ACTIVE par app (cohérence avec le modèle local).
    views = dedupeActiveByApp(views)
    CONNECTIONS_CACHE.set(userId, { views, at: Date.now() })
    return views
  } catch (err) {
    logger.warn("composio: liste des connexions inaccessible", {
      userId,
      error: composioErrorMessage(err),
    })
    return []
  }
}

function dedupeActiveByApp(views: ComposioConnectionView[]): ComposioConnectionView[] {
  const activeByApp = new Map<string, ComposioConnectionView>()
  const others: ComposioConnectionView[] = []
  for (const v of views) {
    if (v.active) activeByApp.set(v.appSlug, v)
    else others.push(v)
  }
  return [...activeByApp.values(), ...others.filter((v) => !activeByApp.has(v.appSlug))]
}

/** Connexion ACTIVE Composio pour une app (ou null). */
export async function getActiveComposioConnection(
  userId: string,
  appSlug: string
): Promise<ComposioConnectionView | null> {
  const views = await listComposioConnections(userId)
  return views.find((v) => v.appSlug === appSlug && v.active) ?? null
}

/** Supprime un compte connecté Composio (id `cpc_<nanoid>`). */
export async function deleteComposioConnection(
  userId: string,
  connectionId: string
): Promise<boolean> {
  const client = await getComposioClient()
  if (!client) return false
  if (!connectionId.startsWith("cpc_")) return false
  const nanoid = connectionId.slice("cpc_".length)
  try {
    // Vérifie l'appartenance avant suppression (jamais de confiance aveugle).
    const views = await listComposioConnections(userId)
    if (!views.some((v) => v.id === connectionId)) return false
    await client.connectedAccounts.delete(nanoid, composioRequestOptions())
    CONNECTIONS_CACHE.delete(userId)
    logger.info("composio: connexion supprimée", { userId, connectionId })
    return true
  } catch (err) {
    logger.warn("composio: suppression impossible", {
      userId,
      connectionId,
      error: composioErrorMessage(err),
    })
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// Exécution d'outils (agents)
// ─────────────────────────────────────────────────────────────

/**
 * Exécute un outil Composio pour un utilisateur GEN3IA.
 * L'action (slug) est le slug d'outil Composio complet
 * (ex. `GITHUB_CREATE_ISSUE`) — obtenu via composioToolsForToolkit.
 */
export async function executeComposioAction(req: {
  userId: string
  appSlug: string
  actionSlug: string
  params: Record<string, unknown>
  agentId?: string | null
}): Promise<ActionExecutionResponse> {
  const started = Date.now()
  const client = await getComposioClient()
  if (!client) {
    throw new ConnectorExecutionError(
      "Intégration Composio non configurée.",
      req.appSlug,
      req.actionSlug
    )
  }

  const connection = await getActiveComposioConnection(req.userId, req.appSlug)
  if (!connection) {
    throw new ConnectorExecutionError(
      `Aucune connexion Composio active pour « ${req.appSlug} ». Connectez l'application depuis la page Connecteurs.`,
      req.appSlug,
      req.actionSlug
    )
  }

  const span = otelStart("composio.action", {
    "composio.app": req.appSlug,
    "composio.action": req.actionSlug,
    "composio.user_id": req.userId,
    "composio.hosted": true,
  })

  try {
    // Le SDK exige une version de toolkit explicite pour l'exécution
    // manuelle (la résolution "latest" est refusée par défaut). On épingle
    // la dernière version disponible de l'outil (métadonnées live en cache) ;
    // à défaut (outil non listé), on exécute "latest" avec le contrôle
    // désactivé — usage documenté par le SDK.
    const defs = await composioToolsForToolkit(req.appSlug).catch(() => [] as ComposioToolDef[])
    const tool = defs.find((d) => d.slug === req.actionSlug)
    const version = [...(tool?.availableVersions ?? [])].sort().at(-1)
    const result = await client.tools.execute(
      req.actionSlug,
      {
        userId: composioUserId(req.userId),
        arguments: req.params,
        ...(version
          ? { version }
          : { dangerouslySkipVersionCheck: true }),
      },
      { ...composioRequestOptions() }
    )
    const latencyMs = Date.now() - started
    const output = JSON.stringify(result.data ?? {}).slice(0, 6000)
    otelEnd(span, result.successful ? "OK" : "ERROR", {
      "composio.latency_ms": latencyMs,
      "composio.successful": result.successful,
    })
    logger.info("composio: outil exécuté", {
      userId: req.userId,
      agentId: req.agentId ?? null,
      app: req.appSlug,
      action: req.actionSlug,
      ok: result.successful,
      latencyMs,
    })
    return {
      ok: result.successful,
      status: result.successful ? 200 : 502,
      statusText: result.successful ? "OK" : "Composio Error",
      data: result.data ?? null,
      output,
      latencyMs,
      error: result.error ?? undefined,
      connectionId: connection.id,
      actionSlug: req.actionSlug,
      appSlug: req.appSlug,
    }
  } catch (err) {
    const message = composioErrorMessage(err)
    otelEnd(span, "ERROR", {}, message)
    throw new ConnectorExecutionError(
      `Exécution Composio « ${req.actionSlug} » impossible : ${message}`,
      req.appSlug,
      req.actionSlug
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Outils des apps connectées (registre d'agents)
// ─────────────────────────────────────────────────────────────

/** Outil brut Composio (définition live). */
interface ComposioToolDef {
  slug: string
  name: string
  description?: string
  toolkitSlug?: string
  availableVersions?: string[]
  inputParameters?: {
    properties?: Record<string, { type?: string | string[]; description?: string }>
    required?: string[]
  }
}

const TOOLS_TTL_MS = 10 * 60 * 1000
const TOOLS_CACHE = new Map<string, { tools: ComposioToolDef[]; at: number }>()

/** Définitions d'outils d'un toolkit (cache 10 min). */
export async function composioToolsForToolkit(appSlug: string): Promise<ComposioToolDef[]> {
  const cached = TOOLS_CACHE.get(appSlug)
  if (cached && Date.now() - cached.at < TOOLS_TTL_MS) return cached.tools

  const client = await getComposioClient()
  if (!client) return []

  try {
    // `getRawComposioTools` renvoie un TABLEAU direct d'outils.
    const res = await client.tools.getRawComposioTools(
      { toolkits: [appSlug], limit: 200 },
      undefined,
      composioRequestOptions()
    )
    const tools = (Array.isArray(res) ? res : ((res as { items?: unknown[] }).items ?? [])) as unknown as ComposioToolDef[]
    TOOLS_CACHE.set(appSlug, { tools, at: Date.now() })
    return tools
  } catch (err) {
    logger.warn("composio: liste des outils inaccessible", {
      appSlug,
      error: composioErrorMessage(err),
    })
    return []
  }
}

/** Heuristique de sensibilité : lectures vs mutations (slug Composio). */
const READ_PREFIXES = /^(GET|LIST|SEARCH|FIND|FETCH|SHOW|VIEW|READ|QUERY|RETRIEVE)_/i

function isReadTool(slug: string): boolean {
  return READ_PREFIXES.test(slug)
}

function toConnectorTool(appSlug: string, tool: ComposioToolDef): ConnectorTool {
  const parameters: Record<string, { type: string; description: string; required: boolean }> = {}
  const props = tool.inputParameters?.properties ?? {}
  const required = new Set(tool.inputParameters?.required ?? [])
  for (const [name, prop] of Object.entries(props)) {
    const rawType = Array.isArray(prop.type) ? prop.type[0] : prop.type
    parameters[name] = {
      type: rawType ?? "string",
      description: prop.description ?? name,
      required: required.has(name),
    }
  }
  return {
    key: connectorToolKey(appSlug, tool.slug),
    name: tool.name,
    description: `[${appSlug} · Composio] ${tool.description ?? tool.name}`,
    category: "CONNECTOR",
    // Sans méthode HTTP connue : conservateur — tout sauf lectures explicites.
    dangerous: !isReadTool(tool.slug),
    parameters,
  }
}

/**
 * Outils Composio des apps connectées d'un utilisateur, filtrés par
 * la liste d'outils autorisés de l'agent (mêmes règles que le local :
 * joker `connectors`, préfixe d'app `connector_<slug>`).
 * `excludeApps` : apps déjà couvertes par des outils locaux (anti-doublon).
 */
export async function composioToolsForUser(
  userId: string,
  allowedTools: string[],
  excludeApps: Set<string>
): Promise<ConnectorTool[]> {
  const connections = await listComposioConnections(userId)
  const active = connections.filter((c) => c.active && !excludeApps.has(c.appSlug))
  if (active.length === 0) return []

  const allowAll = allowedTools.includes("connectors") || allowedTools.includes("connector")
  const allowedApps = new Set(
    allowedTools
      .filter((t) => t.startsWith("connector") && t.includes(":"))
      .map((t) => t.split(":")[1])
  )

  const tools: ConnectorTool[] = []
  for (const conn of active) {
    const appAllowed =
      allowAll ||
      allowedApps.has(conn.appSlug) ||
      allowedTools.includes(`connector_${conn.appSlug}`)
    if (!appAllowed) continue
    const defs = await composioToolsForToolkit(conn.appSlug)
    for (const def of defs) {
      tools.push(toConnectorTool(conn.appSlug, def))
    }
  }
  return tools
}
