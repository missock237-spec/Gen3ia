/**
 * Toolset — pont entre les connexions applicatives et les agents GEN3IA.
 *
 * Deux responsabilités (parallèle des toolsets Composio) :
 * 1. exécuter une action d'une app connectée (exécution réelle HTTP) ;
 * 2. exposer les actions disponibles comme outils LLM (schéma JSON)
 *    pour le moteur d'exécution ReAct de GEN3IA.
 *
 * Clé d'outil : connector_<app>_<action> (ex: connector_github_create_issue).
 */

import { logger } from "@/lib/observability/logger"
import { getAction, getApp } from "../apps"
import {
  deleteConnection,
  ensureFreshConnection,
  getActiveConnection,
  listConnections,
} from "./connections"
import {
  ConnectorExecutionError,
  assertExecutableConnection,
  executeHttpRequest,
} from "./executor"
import type {
  ActionExecutionRequest,
  ActionExecutionResponse,
  ActionParam,
  ActionSpec,
  AppDefinition,
  ConnectedAccountView,
  ConnectionData,
} from "./types"

/** Préfixe réservé des outils connector. */
export const CONNECTOR_TOOL_PREFIX = "connector_"

/** Clé d'outil canonique d'une action. */
export function connectorToolKey(appSlug: string, actionSlug: string): string {
  return `${CONNECTOR_TOOL_PREFIX}${appSlug}_${actionSlug}`
}

/** Parse une clé d'outil connector → { app, action } (null sinon). */
export function parseConnectorToolKey(
  key: string
): { appSlug: string; actionSlug: string } | null {
  if (!key.startsWith(CONNECTOR_TOOL_PREFIX)) return null
  const rest = key.slice(CONNECTOR_TOOL_PREFIX.length)
  const separator = rest.indexOf("_")
  if (separator <= 0) return null
  return { appSlug: rest.slice(0, separator), actionSlug: rest.slice(separator + 1) }
}

// ─────────────────────────────────────────────────────────────
// Exécution d'une action
// ─────────────────────────────────────────────────────────────

/**
 * Exécute une action d'app connectée :
 * 1. résolution app + action ;
 * 2. connexion ACTIVE de l'utilisateur (sinon erreur explicite) ;
 * 3. rafraîchissement de token si expiré ;
 * 4. requête HTTP réelle avec retry-401 unique après refresh.
 */
export async function executeAction(req: ActionExecutionRequest): Promise<ActionExecutionResponse> {
  const started = Date.now()
  const found = getAction(req.appSlug, req.actionSlug)
  if (!found) {
    throw new ConnectorExecutionError(
      `Action inconnue : ${req.appSlug}.${req.actionSlug}`,
      req.appSlug,
      req.actionSlug
    )
  }
  let connection: ConnectedAccountView | null = null
  try {
    connection = await getActiveConnection(req.userId, req.appSlug)
  } catch (err) {
    throw new ConnectorExecutionError(
      `Lecture de la connexion ${req.appSlug} impossible : ${err instanceof Error ? err.message : String(err)}`,
      req.appSlug,
      req.actionSlug
    )
  }
  if (!connection) {
    throw new ConnectorExecutionError(
      `Aucune connexion active pour « ${found.app.name} ». Connectez l'application depuis la page Connecteurs.`,
      req.appSlug,
      req.actionSlug
    )
  }

  let data: ConnectionData = connection.data
  const check = assertExecutableConnection(data)
  if (!check.ok) {
    // Tente un rafraîchissement immédiat avant de renoncer.
    const fresh = await ensureFreshConnection(connection).catch(() => null)
    if (fresh && assertExecutableConnection(fresh.data).ok) {
      data = fresh.data
    } else {
      throw new ConnectorExecutionError(
        `Connexion « ${found.app.name} » non exécutable : ${check.reason}`,
        req.appSlug,
        req.actionSlug
      )
    }
  }

  const connectionId = connection.id
  const response = await executeHttpRequest(found.app, found.action, data, req.params, {
    connectionId,
    on401: async () => {
      // Rafraîchit puis rejoue (une seule fois — géré par l'executor).
      const fresh = await ensureFreshConnection(connection as ConnectedAccountView).catch(() => null)
      return fresh ? fresh.data : null
    },
  })

  logger.info("connectors: action exécutée", {
    userId: req.userId,
    agentId: req.agentId ?? null,
    app: req.appSlug,
    action: req.actionSlug,
    ok: response.ok,
    status: response.status,
    latencyMs: Date.now() - started,
  })
  return response
}

// ─────────────────────────────────────────────────────────────
// Exposition des outils LLM
// ─────────────────────────────────────────────────────────────

/** Schéma JSON d'un paramètre d'action (format tools registry GEN3IA). */
function paramToSchema(p: ActionParam): Record<string, unknown> {
  return {
    type: p.type === "enum" ? "string" : p.type === "integer" ? "number" : p.type,
    description: p.enum ? `${p.description} (valeurs: ${p.enum.join(" | ")})` : p.description,
    required: p.required,
    ...(p.default !== undefined ? { default: p.default } : {}),
  }
}

export interface ConnectorTool {
  key: string
  name: string
  description: string
  category: string
  dangerous: boolean
  parameters: Record<string, ReturnType<typeof paramToSchema>>
}

/**
 * Liste les actions des apps connectées d'un utilisateur,
 * filtrées par la liste d'outils autorisés de l'agent :
 * - clé exacte : connector_github_create_issue ;
 * - préfixe d'app : connector_github (toutes les actions) ;
 * - joker « connectors » : toutes les apps connectées.
 */
export async function connectorToolsForUser(
  userId: string,
  allowedTools: string[]
): Promise<ConnectorTool[]> {
  const connections = await listConnections(userId).catch(() => [])
  const active = connections.filter((c) => c.status === "ACTIVE")
  if (active.length === 0) return []

  const allowAll = allowedTools.includes("connectors") || allowedTools.includes("connector")
  const allowedApps = new Set(
    allowedTools
      .filter((t) => t.startsWith("connector") && t.includes(":"))
      .map((t) => t.split(":")[1])
  )

  const tools: ConnectorTool[] = []
  for (const conn of active) {
    const app: AppDefinition | null = getApp(conn.appSlug)
    if (!app) continue
    const appAllowed =
      allowAll ||
      allowedApps.has(app.slug) ||
      allowedTools.includes(`${CONNECTOR_TOOL_PREFIX}${app.slug}`)
    if (!appAllowed) {
      // Les actions individuellement autorisées passent quand même.
      for (const action of app.actions) {
        if (allowedTools.includes(connectorToolKey(app.slug, action.slug))) {
          tools.push(toConnectorTool(app.slug, action))
        }
      }
      continue
    }
    for (const action of app.actions) {
      tools.push(toConnectorTool(app.slug, action))
    }
  }
  return tools
}

function toConnectorTool(appSlug: string, action: ActionSpec): ConnectorTool {
  const parameters: Record<string, ReturnType<typeof paramToSchema>> = {}
  for (const p of action.params) parameters[p.name] = paramToSchema(p)
  return {
    key: connectorToolKey(appSlug, action.slug),
    name: action.name,
    description: `[${appSlug}] ${action.description}`,
    category: "CONNECTOR",
    // Les mutations (non-GET) sont marquées sensibles → HITL possible.
    dangerous: action.method !== "GET",
    parameters,
  }
}

/** Exécution dispatchée depuis le registre d'outils global. */
export async function runConnectorTool(
  key: string,
  args: Record<string, unknown>,
  ctx: { userId: string; agentId?: string | null }
): Promise<ActionExecutionResponse> {
  const parsed = parseConnectorToolKey(key)
  const failure = (error: string): ActionExecutionResponse => ({
    ok: false,
    status: 0,
    statusText: "Connector Error",
    data: null,
    output: "",
    latencyMs: 0,
    error,
    connectionId: "",
    actionSlug: parsed?.actionSlug ?? "",
    appSlug: parsed?.appSlug ?? "",
  })
  if (!parsed) {
    return failure(`Clé d'outil connector invalide : ${key}`)
  }
  try {
    return await executeAction({
      userId: ctx.userId,
      agentId: ctx.agentId ?? null,
      appSlug: parsed.appSlug,
      actionSlug: parsed.actionSlug,
      params: args,
    })
  } catch (err) {
    // Erreurs structurelles (action inconnue, connexion absente,
    // token expiré…) : remontées comme résultat ko, jamais de throw
    // dans la boucle d'outils de l'agent.
    return failure(err instanceof Error ? err.message : String(err))
  }
}

/** Supprime une connexion (utilisé par les routes API). */
export { deleteConnection, listConnections }
