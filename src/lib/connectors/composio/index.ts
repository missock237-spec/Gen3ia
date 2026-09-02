/**
 * Connecteurs d'applications externes — intégration Composio (ADR-0014).
 *
 * Adaptation du projet ComposioHQ/composio (analyse complète du monorepo
 * officiel : SDK TypeScript @composio/core + client @composio/client) :
 * GEN3IA parle directement à l'API Composio v3.1 (backend.composio.dev ou
 * instance self-hosted) et expose 1000+ applications réelles — Google,
 * GitHub, Slack, Notion, WhatsApp, Gmail, Stripe… — aux agents IA.
 *
 * Configuration (aucune clé en dur) :
 *   COMPOSIO_API_KEY  — clé du projet Composio (dashboard.composio.dev)
 *   COMPOSIO_BASE_URL — optionnel, self-hosting Composio
 *
 * Sans clé : comportement fail-closed explicite (CONNECTOR_NOT_CONFIGURED),
 * cohérent avec Chariow et les fournisseurs LLM.
 */

export {
  isComposioConfigured,
  composioApiKey,
  composioBaseUrl,
  composioUserId,
} from "./client"
export type {
  ToolkitItem,
  ToolkitListParams,
  ToolkitListResponse,
  ToolItem,
  ToolListParams,
  ToolListResponse,
  AuthConfigItem,
  ConnectedAccountItem,
  ConnectedAccountStatus,
  LinkCreateParams,
  LinkCreateResponse,
  ToolExecuteParams,
  ToolExecuteResponse,
} from "./types"

export {
  listAppsForUser,
  listActionsForUser,
  initiateConnection,
  listConnections,
  syncConnection,
  syncAllConnections,
  disconnectConnection,
  executeActionForUser,
  connectedAppsOverview,
  invalidateToolCache,
} from "./service"
export type {
  AppSummary,
  ActionSummary,
  ConnectionView,
  ActionExecutionResult,
  ConnectedAppOverview,
} from "./service"
