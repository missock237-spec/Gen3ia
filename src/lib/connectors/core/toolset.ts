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
import { startSpan as otelStart, endSpan as otelEnd } from "@/lib/observability/otel"
import { getAction, getApp } from "../apps"
import {
  composioToolsForUser,
  executeComposioAction,
  getActiveComposioConnection,
} from "../composio/provider"
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
import {
  CONNECTOR_TOOL_PREFIX,
  connectorToolKey,
  parseConnectorToolKey,
  type ConnectorTool,
} from "./types"
import type {
  ActionExecutionRequest,
  ActionExecutionResponse,
  ActionParam,
  ActionSpec,
  AppDefinition,
  ConnectedAccountView,
  ConnectionData,
} from "./types"

// Ré-exports (compatibilité : registry/executor importent depuis le toolset).
export { CONNECTOR_TOOL_PREFIX, connectorToolKey, parseConnectorToolKey }
export type { ConnectorTool }

// ─────────────────────────────────────────────────────────────
// Exécution d'une action
// ─────────────────────────────────────────────────────────────

/**
 * Exécute une action d'app connectée :
 * 1. résolution app + action ;
 * 2. connexion ACTIVE de l'utilisateur (sinon erreur explicite) ;
 * 3. rafraîchissement de token si expiré ;
 * 4. requête HTTP réelle avec retry-401 unique après refresh.
 *
 * v4.2 — relay Composio : si l'utilisateur n'a pas de connexion LOCALE
 * active pour l'app mais une connexion hébergée Composio, l'action est
 * exécutée par la plateforme Composio (`tools.execute`). La connexion
 * locale reste prioritaire (secrets maîtrisés GEN3IA de bout en bout).
 */
export async function executeAction(req: ActionExecutionRequest): Promise<ActionExecutionResponse> {
  const started = Date.now()
  const found = getAction(req.appSlug, req.actionSlug)
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

  // Chemin local : action connue + connexion locale active.
  if (connection && found) {
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

  // Relay Composio (connexion hébergée) — v4.2 :
  // lève ConnectorExecutionError (message explicite) si aucune connexion.
  const composioConnection = await getActiveComposioConnection(req.userId, req.appSlug).catch(() => null)
  if (composioConnection) {
    return executeComposioAction({
      userId: req.userId,
      agentId: req.agentId,
      appSlug: req.appSlug,
      actionSlug: req.actionSlug,
      params: req.params,
    })
  }

  // Aucun chemin disponible : erreurs précises (messages locaux préservés).
  if (!found) {
    throw new ConnectorExecutionError(
      `Action inconnue : ${req.appSlug}.${req.actionSlug}`,
      req.appSlug,
      req.actionSlug
    )
  }
  throw new ConnectorExecutionError(
    `Aucune connexion active pour « ${found.app.name} ». Connectez l'application depuis la page Connecteurs.`,
    req.appSlug,
    req.actionSlug
  )
}

// ─────────────────────────────────────────────────────────────
// Exposition des outils LLM
// ─────────────────────────────────────────────────────────────

/** Schéma JSON d'un paramètre d'action (format tools registry GEN3IA). */
function paramToSchema(p: ActionParam): { type: string; description: string; required: boolean; default?: unknown } {
  return {
    type: p.type === "enum" ? "string" : p.type === "integer" ? "number" : p.type,
    description: p.enum ? `${p.description} (valeurs: ${p.enum.join(" | ")})` : p.description,
    required: p.required,
    ...(p.default !== undefined ? { default: p.default } : {}),
  }
}

/**
 * Liste les actions des apps connectées d'un utilisateur,
 * filtrées par la liste d'outils autorisés de l'agent :
 * - clé exacte : connector_github_create_issue ;
 * - préfixe d'app : connector_github (toutes les actions) ;
 * - joker « connectors » : toutes les apps connectées.
 *
 * v4.2 — fusion avec les outils des connexions hébergées Composio
 * (apps connectables en un clic sans identifiants locaux) — sans
 * doublon : une app déjà couverte en local n'est pas re-listée.
 */
export async function connectorToolsForUser(
  userId: string,
  allowedTools: string[]
): Promise<ConnectorTool[]> {
  const connections = await listConnections(userId).catch(() => [])
  const active = connections.filter((c) => c.status === "ACTIVE")

  const allowAll = allowedTools.includes("connectors") || allowedTools.includes("connector")
  const allowedApps = new Set(
    allowedTools
      .filter((t) => t.startsWith("connector") && t.includes(":"))
      .map((t) => t.split(":")[1])
  )

  const tools: ConnectorTool[] = []
  const coveredApps = new Set<string>()
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
    // Outils locaux exposés pour cette app → Composio ne la re-liste pas.
    if (app.actions.length > 0) coveredApps.add(app.slug)
  }

  // Outils Composio (connexions hébergées) — v4.2.
  const composioTools = await composioToolsForUser(userId, allowedTools, coveredApps).catch(() => [])
  tools.push(...composioTools)

  return tools
}

function toConnectorTool(appSlug: string, action: ActionSpec): ConnectorTool {
  const parameters: ConnectorTool["parameters"] = {}
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

/**
 * Exécution dispatchée depuis le registre d'outils global.
 *
 * v4.3 — Action Gateway : l'appel passe par la couche de décision
 * (Risk Engine → Permission Engine → exécution → vérification → audit)
 * avant d'atteindre executeAction. Le contrat ne change pas : jamais de
 * throw vers la boucle d'outils de l'agent.
 *
 * Import DYNAMIQUE du gateway : aucun cycle statique
 * toolset → gateway → toolset (le gateway importe executeAction).
 */
export async function runConnectorTool(
  key: string,
  args: Record<string, unknown>,
  ctx: {
    userId: string
    agentId?: string | null
    taskId?: string | null
    planId?: string | null
    stepIndex?: number | null
    /** Approbation amont (HITL du plan / réglage) — le gateway affine. */
    preAuthorized?: boolean
  }
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
  // v3.6 — OTel : span d'appel externe (app + action + statut).
  // v4.3 — le span englobe désormais TOUT le pipeline du gateway.
  const span = otelStart("composio.action", {
    "composio.app": parsed.appSlug,
    "composio.action": parsed.actionSlug,
    "composio.user_id": ctx.userId,
  })
  try {
    const { executeGuardedAction } = await import("../gateway/gateway")
    const result = await executeGuardedAction({
      userId: ctx.userId,
      appSlug: parsed.appSlug,
      actionSlug: parsed.actionSlug,
      params: args,
      agentId: ctx.agentId ?? null,
      taskId: ctx.taskId ?? null,
      planId: ctx.planId ?? null,
      stepIndex: ctx.stepIndex ?? null,
      preAuthorized: ctx.preAuthorized,
      source: "AGENT",
    })
    otelEnd(span, result.ok ? "OK" : "ERROR", {
      "http.status_code": result.status,
      "composio.latency_ms": result.latencyMs,
      "gateway.risk_level": result.risk.level,
      "gateway.execution_status": result.executionStatus,
    })
    return result
  } catch (err) {
    otelEnd(span, "ERROR", {}, err instanceof Error ? err.message : String(err))
    // Erreurs structurelles (action inconnue, connexion absente,
    // token expiré…) : remontées comme résultat ko, jamais de throw
    // dans la boucle d'outils de l'agent.
    return failure(err instanceof Error ? err.message : String(err))
  }
}

/** Supprime une connexion (utilisé par les routes API). */
export { deleteConnection, listConnections }
