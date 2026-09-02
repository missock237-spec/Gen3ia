import type { ToolDefinition, ToolResult, ToolContext } from "./registry"
import {
  connectedAppsOverview,
  executeActionForUser,
  listActionsForUser,
  isComposioConfigured,
} from "@/lib/connectors/composio"
import { logger } from "@/lib/observability/logger"

/**
 * Outils Composio — le pont entre les agents GEN3IA et 1000+ applications
 * réelles (GitHub, Slack, Notion, Gmail, WhatsApp, Google Sheets…).
 *
 * Trois outils génériques suffisent à couvrir tout le catalogue (pattern
 * « tool router » du projet Composio adapté à notre moteur ReAct) :
 *  - composio_list_apps     : inventaire des apps connectées (vue planner) ;
 *  - composio_list_actions  : découverte des actions d'une app (slug, schéma) ;
 *  - composio_execute       : exécution authentifiée d'une action.
 *
 * Ces outils n'apparaissent dans le catalogue du moteur QUE si
 * COMPOSIO_API_KEY est configurée (économie de tokens sinon), et leur
 * exécution échoue explicitement (jamais de réponse simulée).
 */

export const COMPOSIO_TOOL_CATALOG: ToolDefinition[] = [
  {
    key: "composio_list_apps",
    name: "Applications connectées",
    description:
      "Liste les applications externes connectées par l'utilisateur (ex: github, slack, notion) dont le statut est ACTIVE, avec leur nombre d'utilisations. Sert à savoir quelles apps sont utilisables avant d'appeler composio_list_actions et composio_execute.",
    category: "CONNECTEURS",
    dangerous: false,
    parameters: {},
  },
  {
    key: "composio_list_actions",
    name: "Actions d'applications",
    description:
      "Recherche les actions disponibles dans les applications connectées de l'utilisateur (ex: envoyer un Slack, créer une issue GitHub, chercher un email Gmail). Chaque action est identifiée par un slug (ex: GITHUB_CREATE_AN_ISSUE) avec la description de ses paramètres. Étape obligatoire avant composio_execute.",
    category: "CONNECTEURS",
    dangerous: false,
    parameters: {
      app: {
        type: "string",
        description: "Slug de l'application (ex: github, slack) — filtre sur une seule app si fourni",
        required: false,
      },
      search: {
        type: "string",
        description: "Mots-clés de recherche (ex: send message, create issue)",
        required: false,
      },
    },
  },
  {
    key: "composio_execute",
    name: "Exécuter une action applicative",
    description:
      "Exécute une action d'application externe authentifiée (l'app doit être connectée par l'utilisateur). Fournir le slug exact de l'action (obtenu via composio_list_actions) et ses paramètres conformes au schéma annoncé.",
    category: "CONNECTEURS",
    dangerous: true,
    parameters: {
      action: {
        type: "string",
        description: "Slug exact de l'action (ex: GITHUB_CREATE_AN_ISSUE)",
        required: true,
      },
      params: {
        type: "object",
        description:
          "Paramètres de l'action au format JSON (ex: {\"repository\":\"org/repo\",\"title\":\"Bug\",\"body\":\"...\"})",
        required: true,
      },
    },
  },
]

// ---------- Implémentations ----------

async function toolListApps(ctx: ToolContext): Promise<ToolResult> {
  const started = Date.now()
  try {
    const apps = await connectedAppsOverview(ctx.userId)
    return {
      ok: true,
      data: apps,
      latencyMs: Date.now() - started,
      output:
        apps.length === 0
          ? "Aucune application externe connectée. L'utilisateur peut en connecter depuis la page Connecteurs (ex: github, slack, notion, gmail…)."
          : `Applications connectées et ACTIVES :\n${apps
              .map((a) => `- ${a.toolkitSlug} (${a.toolkitName ?? a.toolkitSlug}) — ${a.executions} action(s) exécutée(s)`)
              .join("\n")}`,
    }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

async function toolListActions(
  args: { app?: string; search?: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const started = Date.now()
  try {
    const actions = await listActionsForUser(ctx.userId, {
      toolkit: args.app?.trim() || undefined,
      search: args.search?.trim() || undefined,
      limit: 15,
    })
    if (actions.length === 0) {
      return {
        ok: true,
        data: [],
        latencyMs: Date.now() - started,
        output:
          "Aucune action trouvée. Vérifiez le nom de l'application (elle doit être connectée) ou élargissez la recherche.",
      }
    }
    const lines = actions.map((a) => {
      const params = formatParams(a.parameters)
      return `- ${a.slug} [${a.toolkitSlug}] : ${a.description.slice(0, 220)}${params ? `\n  paramètres : ${params}` : ""}`
    })
    return {
      ok: true,
      data: actions.map((a) => ({ slug: a.slug, name: a.name, toolkit: a.toolkitSlug })),
      latencyMs: Date.now() - started,
      output: lines.join("\n").slice(0, 6000),
    }
  } catch (err) {
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

/** Compresse le schéma JSON des paramètres en une ligne lisible pour le LLM. */
function formatParams(schema: Record<string, unknown>): string {
  try {
    const props = (schema as { properties?: Record<string, { type?: string; description?: string }> })
      .properties
    if (!props) return ""
    return Object.entries(props)
      .map(([name, p]) => `${name}(${p?.type ?? "?"})`)
      .join(", ")
      .slice(0, 300)
  } catch {
    return ""
  }
}

async function toolExecuteAction(
  args: { action: string; params?: Record<string, unknown> },
  ctx: ToolContext
): Promise<ToolResult> {
  const started = Date.now()
  const actionSlug = String(args.action ?? "").trim()
  if (!actionSlug) {
    return { ok: false, output: "", error: "Paramètre « action » requis (slug de l'action).", latencyMs: 0 }
  }
  try {
    const result = await executeActionForUser(ctx.userId, {
      action: actionSlug,
      params: args.params ?? {},
    })
    logger.info("composio: action exécutée par un agent", {
      userId: ctx.userId,
      agentId: ctx.agentId ?? null,
      action: actionSlug,
      ok: result.ok,
      latencyMs: result.latencyMs,
    })
    return {
      ok: result.ok,
      data: result.data,
      latencyMs: Date.now() - started,
      output: result.output,
      error: result.error ?? undefined,
    }
  } catch (err) {
    // CONNECTOR_NOT_CONNECTED / NOT_CONFIGURED / erreurs API : remontées
    // telles quelles au moteur d'auto-correction (pas de réponse simulée).
    return {
      ok: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

// ---------- Dispatch ----------

export async function runComposioTool(
  key: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!isComposioConfigured()) {
    return {
      ok: false,
      output: "",
      error:
        "Connecteurs non activés : COMPOSIO_API_KEY n'est pas configurée sur le serveur. Les actions d'applications externes sont indisponibles.",
      latencyMs: 0,
    }
  }
  switch (key) {
    case "composio_list_apps":
      return toolListApps(ctx)
    case "composio_list_actions":
      return toolListActions(
        {
          app: args.app ? String(args.app) : undefined,
          search: args.search ? String(args.search) : undefined,
        },
        ctx
      )
    case "composio_execute":
      return toolExecuteAction(
        {
          action: String(args.action ?? ""),
          params:
            args.params && typeof args.params === "object"
              ? (args.params as Record<string, unknown>)
              : {},
        },
        ctx
      )
    default:
      return { ok: false, output: "", error: `Outil Composio inconnu : ${key}`, latencyMs: 0 }
  }
}
