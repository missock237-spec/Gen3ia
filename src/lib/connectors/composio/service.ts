import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/observability/logger"
import {
  createManagedAuthConfig,
  deleteConnectedAccount,
  executeTool,
  getConnectedAccount,
  getToolkit,
  getTool,
  initiateLink,
  isComposioConfigured,
  listAuthConfigs,
  listConnectedAccounts,
  listToolkits,
  listTools,
  composioUserId,
} from "./client"
import type { ConnectedAccountItem, ToolItem } from "./types"

/**
 * Service connecteurs GEN3IA — orchestre l'API Composio et la base locale.
 *
 * Principe de sécurité (ADR-0014) : les jetons OAuth des apps externes
 * (Google, Slack, Notion…) vivent dans le coffre Composio ; GEN3IA ne stocke
 * que les identifiants de comptes connectés et leurs statuts. Les agents
 * exécutent des actions via l'API Composio qui injecte l'authentification.
 *
 * Chaque utilisateur GEN3IA possède un identifiant Composio namespacé
 * (`g3ia_<userId>`) : ses connexions sont cloisonnées et réutilisables
 * par tous ses agents.
 */

// ---------- Cache mémoire des actions (résolution toolkit, TTL 5 min) ----------

const TOOL_CACHE_TTL_MS = 5 * 60 * 1000
const toolCache = new Map<string, { tool: ToolItem; at: number }>()

function cacheKey(actionSlug: string): string {
  return actionSlug.toUpperCase()
}

/** Résout une action (slug) avec cache mémoire — évite un aller-retour par exécution. */
async function resolveTool(actionSlug: string): Promise<ToolItem> {
  const key = cacheKey(actionSlug)
  const cached = toolCache.get(key)
  if (cached && Date.now() - cached.at < TOOL_CACHE_TTL_MS) return cached.tool
  const tool = await getTool(actionSlug)
  toolCache.set(key, { tool, at: Date.now() })
  return tool
}

/** Invalide le cache (utile en cas de dérive côté Composio). */
export function invalidateToolCache(actionSlug?: string): void {
  if (actionSlug) toolCache.delete(cacheKey(actionSlug))
  else toolCache.clear()
}

// ---------- Catalogue ----------

export interface AppSummary {
  slug: string
  name: string
  description: string
  categories: string[]
  logo: string | null
  authGuideUrl: string | null
  connected: boolean
  connectionStatus: string | null
}

/** Liste les applications du catalogue Composio, enrichies de l'état de connexion de l'utilisateur. */
export async function listAppsForUser(
  userId: string,
  params: { search?: string; category?: string; limit?: number; cursor?: string } = {}
): Promise<{ apps: AppSummary[]; total: number; totalPages: number; cursor: string | null }> {
  const [catalog, connections] = await Promise.all([
    listToolkits({
      search: params.search,
      category: params.category,
      limit: params.limit ?? 30,
      cursor: params.cursor,
      sort_by: params.search ? "alphabetically" : "usage",
    }),
    db.connectedAccount.findMany({ where: { userId }, select: { toolkitSlug: true, status: true } }),
  ])
  const bySlug = new Map(connections.map((c) => [c.toolkitSlug, c]))
  const apps: AppSummary[] = catalog.items.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: typeof t.meta?.description === "string" ? t.meta.description : "",
    categories: Array.isArray(t.meta?.categories) ? (t.meta.categories as string[]) : [],
    logo: typeof t.meta?.logo === "string" ? t.meta.logo : null,
    authGuideUrl: t.authGuideUrl ?? null,
    connected: bySlug.has(t.slug),
    connectionStatus: bySlug.get(t.slug)?.status ?? null,
  }))
  return {
    apps,
    total: catalog.total_items,
    totalPages: catalog.total_pages,
    cursor: catalog.next_cursor ?? null,
  }
}

export interface ActionSummary {
  slug: string
  name: string
  description: string
  toolkitSlug: string
  toolkitName: string
  noAuth: boolean
  parameters: Record<string, unknown>
}

/** Liste les actions d'une application (ou recherche globale). */
export async function listActionsForUser(
  userId: string,
  params: { toolkit?: string; search?: string; limit?: number } = {}
): Promise<ActionSummary[]> {
  const res = await listTools({
    toolkit: params.toolkit,
    query: params.search,
    limit: params.limit ?? 25,
    include_deprecated: false,
  })
  const connections = await db.connectedAccount.findMany({
    where: { userId, status: "ACTIVE" },
    select: { toolkitSlug: true },
  })
  const activeSlugs = new Set(connections.map((c) => c.toolkitSlug))
  return res.items
    .filter((t) => t.no_auth || activeSlugs.has(t.toolkit?.slug ?? ""))
    .map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      toolkitSlug: t.toolkit?.slug ?? "",
      toolkitName: t.toolkit?.name ?? "",
      noAuth: t.no_auth,
      parameters: t.input_parameters ?? {},
    }))
}

// ---------- Connexions ----------

export interface ConnectionView {
  id: string
  toolkitSlug: string
  toolkitName: string | null
  composioId: string
  status: string
  statusReason: string | null
  alias: string | null
  executions: number
  lastSyncedAt: Date
  createdAt: Date
}

function toView(row: {
  id: string
  toolkitSlug: string
  toolkitName: string | null
  composioId: string
  status: string
  statusReason: string | null
  alias: string | null
  executions: number
  lastSyncedAt: Date
  createdAt: Date
}): ConnectionView {
  return { ...row }
}

/**
 * Initie la connexion d'une application : résout (ou crée) la configuration
 * d'authentification Composio, génère le lien d'autorisation, persiste la
 * connexion en INITIATED et renvoie l'URL OAuth à suivre.
 */
export async function initiateConnection(
  userId: string,
  input: { toolkitSlug: string; callbackUrl?: string }
): Promise<{ connection: ConnectionView; redirectUrl: string; expiresAt: string }> {
  const toolkit = await getToolkit(input.toolkitSlug)

  // 1. Auth config existante pour ce toolkit ?
  let authConfigId: string | undefined
  try {
    const configs = await listAuthConfigs(toolkit.slug)
    const enabled = configs.find((c) => c.status === "ENABLED") ?? configs[0]
    authConfigId = enabled?.id
  } catch (err) {
    logger.warn("composio: listage auth_configs échoué", {
      toolkit: toolkit.slug,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 2. Sinon : création d'une config « Composio-managed » (OAuth géré par
  //    Composio — même repli que toolkits.authorize() du SDK officiel).
  if (!authConfigId) {
    if (toolkit.authConfigDetails && toolkit.authConfigDetails.length > 0) {
      authConfigId = await createManagedAuthConfig(toolkit.slug, toolkit.name)
    } else {
      throw new AppError("CONNECTOR_NOT_FOUND", {
        message: `Aucune configuration d'authentification disponible pour « ${toolkit.name} ». Créez-la dans le tableau de bord Composio (dashboard.composio.dev).`,
        detail: `toolkit=${toolkit.slug} sans auth config ni authConfigDetails`,
      })
    }
  }

  // 3. Lien d'autorisation pour CET utilisateur.
  const link = await initiateLink({
    auth_config_id: authConfigId,
    user_id: composioUserId(userId),
    callback_url: input.callbackUrl,
  })

  // 4. Persistance locale (statut INITIATED jusqu'au retour OAuth).
  const existing = await db.connectedAccount.findFirst({
    where: { userId, composioId: link.connected_account_id },
  })
  const row =
    existing ??
    (await db.connectedAccount.create({
      data: {
        userId,
        toolkitSlug: toolkit.slug,
        toolkitName: toolkit.name,
        composioId: link.connected_account_id,
        authConfigId,
        status: "INITIATED",
      },
    }))
  return { connection: toView(row), redirectUrl: link.redirect_url, expiresAt: link.expires_at }
}

/** Connexions de l'utilisateur, synchronisées à la demande (les non-ACTIVES d'abord). */
export async function listConnections(
  userId: string,
  opts: { sync?: boolean } = {}
): Promise<ConnectionView[]> {
  const rows = await db.connectedAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
  if (opts.sync && isComposioConfigured()) {
    const stale = rows.filter(
      (r) => r.status !== "ACTIVE" && Date.now() - r.lastSyncedAt.getTime() > 5_000
    )
    await Promise.allSettled(stale.map((r) => syncConnection(userId, r.id)))
    const refreshed = await db.connectedAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
    return refreshed.map(toView)
  }
  return rows.map(toView)
}

/** Synchronise le statut d'une connexion depuis Composio. */
export async function syncConnection(userId: string, connectionId: string): Promise<ConnectionView> {
  const row = await db.connectedAccount.findFirst({ where: { id: connectionId, userId } })
  if (!row) throw new AppError("CONNECTOR_NOT_FOUND", { message: "Connexion introuvable." })
  let remote: ConnectedAccountItem
  try {
    remote = await getConnectedAccount(row.composioId)
  } catch (err) {
    // 404 distant : la connexion a été révoquée/supprimée chez Composio.
    if (err instanceof AppError && err.code === "CONNECTOR_NOT_FOUND") {
      const updated = await db.connectedAccount.update({
        where: { id: row.id },
        data: { status: "REVOKED", statusReason: "Supprimée côté Composio", lastSyncedAt: new Date() },
      })
      return toView(updated)
    }
    throw err
  }
  const updated = await db.connectedAccount.update({
    where: { id: row.id },
    data: {
      status: remote.status,
      statusReason: remote.status_reason,
      toolkitName: remote.toolkit?.name ?? row.toolkitName,
      lastSyncedAt: new Date(),
    },
  })
  return toView(updated)
}

/** Déconnecte : révoque chez Composio puis supprime localement. */
export async function disconnectConnection(userId: string, connectionId: string): Promise<void> {
  const row = await db.connectedAccount.findFirst({ where: { id: connectionId, userId } })
  if (!row) throw new AppError("CONNECTOR_NOT_FOUND", { message: "Connexion introuvable." })
  try {
    await deleteConnectedAccount(row.composioId)
  } catch (err) {
    // Révocation distante impossible (déjà supprimée ?) : on journalise et
    // on nettoie localement quand même — l'utilisateur veut se déconnecter.
    logger.warn("composio: révocation distante échouée, suppression locale seule", {
      userId,
      toolkit: row.toolkitSlug,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  await db.connectedAccount.delete({ where: { id: row.id } })
}

/** Synchronise TOUTES les connexions distantes de l'utilisateur (retour OAuth). */
export async function syncAllConnections(userId: string): Promise<ConnectionView[]> {
  if (!isComposioConfigured()) return listConnections(userId)
  const remote = await listConnectedAccounts({ user_id: composioUserId(userId), limit: 100 })
  const byComposioId = new Map(remote.items.map((r) => [r.id, r]))
  const rows = await db.connectedAccount.findMany({ where: { userId } })
  for (const row of rows) {
    const r = byComposioId.get(row.composioId)
    if (r) {
      await db.connectedAccount.update({
        where: { id: row.id },
        data: {
          status: r.status,
          statusReason: r.status_reason,
          toolkitName: r.toolkit?.name ?? row.toolkitName,
          lastSyncedAt: new Date(),
        },
      })
    } else if (row.status !== "REVOKED") {
      await db.connectedAccount.update({
        where: { id: row.id },
        data: { status: "REVOKED", statusReason: "Absente côté Composio", lastSyncedAt: new Date() },
      })
    }
  }
  const fresh = await db.connectedAccount.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
  return fresh.map(toView)
}

// ---------- Exécution d'actions (le pont vers les agents) ----------

export interface ActionExecutionResult {
  ok: boolean
  data: Record<string, unknown> | null
  error: string | null
  logId: string | null
  latencyMs: number
  /** Trace lisible pour le moteur (observation de l'agent). */
  output: string
}

/**
 * Exécute une action d'application externe pour le compte de l'utilisateur.
 * Séquence : résolution de l'action → connexion ACTIVE du toolkit →
 * exécution authentifiée chez Composio → journalisation des usages.
 */
export async function executeActionForUser(
  userId: string,
  input: { action: string; params?: Record<string, unknown> }
): Promise<ActionExecutionResult> {
  const started = Date.now()
  const actionSlug = (input.action ?? "").trim()
  if (!actionSlug) {
    return { ok: false, data: null, error: "Action vide.", logId: null, latencyMs: 0, output: "" }
  }

  // 1. Résolution de l'action (cache 5 min).
  let tool: ToolItem
  try {
    tool = await resolveTool(actionSlug)
  } catch (err) {
    if (err instanceof AppError && err.code === "CONNECTOR_NOT_CONFIGURED") throw err
    const message =
      err instanceof AppError ? err.userMessage : `Action « ${actionSlug} » introuvable.`
    return { ok: false, data: null, error: message, logId: null, latencyMs: Date.now() - started, output: "" }
  }

  const toolkitSlug = tool.toolkit?.slug ?? ""

  // 2. Connexion ACTIVE de l'utilisateur pour ce toolkit (sauf no_auth).
  let connectedAccountId: string | undefined
  if (!tool.no_auth) {
    const row = await db.connectedAccount.findFirst({
      where: { userId, toolkitSlug, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    })
    if (!row) {
      throw new AppError("CONNECTOR_NOT_CONNECTED", {
        message: `Aucune connexion active à « ${tool.toolkit?.name ?? toolkitSlug} ». Connectez cette application depuis la page Connecteurs avant d'exécuter ${actionSlug}.`,
        detail: `toolkit=${toolkitSlug} action=${actionSlug}`,
      })
    }
    connectedAccountId = row.composioId
  }

  // 3. Exécution authentifiée.
  const res = await executeTool(actionSlug, {
    arguments: input.params ?? {},
    connected_account_id: connectedAccountId,
    user_id: composioUserId(userId),
  })

  // 4. Compteur d'usage local.
  if (connectedAccountId) {
    await db.connectedAccount
      .update({
        where: { composioId: connectedAccountId },
        data: { executions: { increment: 1 } },
      })
      .catch((err: unknown) => {
        logger.warn("composio: impossible d'incrémenter le compteur d'exécutions", {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  const latency = Date.now() - started
  const output = res.successful
    ? formatActionOutput(res.data)
    : `Échec de l'action ${actionSlug} : ${res.error ?? "erreur inconnue"}`

  return {
    ok: res.successful,
    data: res.data,
    error: res.error,
    logId: res.log_id ?? null,
    latencyMs: latency,
    output,
  }
}

/** Met en forme la sortie d'une action pour le contexte LLM (compact, tronqué). */
function formatActionOutput(data: Record<string, unknown> | null): string {
  if (!data) return "(aucune donnée retournée)"
  const json = JSON.stringify(data)
  if (json.length <= 4000) return json
  // Troncature intelligente : première clé « texte » si présente.
  for (const key of ["content", "text", "response", "result", "data", "output", "body"]) {
    const value = data[key]
    if (typeof value === "string" && value.length > 0) {
      return value.slice(0, 4000)
    }
  }
  return json.slice(0, 4000) + "…(tronqué)"
}

// ---------- Vue « agent » : ce que le moteur d'inférence voit ----------

export interface ConnectedAppOverview {
  toolkitSlug: string
  toolkitName: string | null
  status: string
  executions: number
}

/** Apps connectées de l'utilisateur (vue condensée pour le planner/executor). */
export async function connectedAppsOverview(userId: string): Promise<ConnectedAppOverview[]> {
  const rows = await db.connectedAccount.findMany({
    where: { userId, status: "ACTIVE" },
    select: { toolkitSlug: true, toolkitName: true, status: true, executions: true },
    orderBy: { toolkitSlug: "asc" },
  })
  return rows
}
