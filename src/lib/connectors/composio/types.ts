/**
 * Types du contrat Composio API v3.1 — extraits fidèlement du SDK officiel
 * (@composio/client, généré depuis leur spéc OpenAPI Stainless) analysé dans
 * ComposioHQ/composio : mêmes champs, mêmes cas de valeurs.
 */

// ---------- Toolkits (applications) ----------

export interface ToolkitItem {
  /** Identifiant lisible unique (ex: "github", "slack", "notion"). */
  slug: string
  /** Nom d'affichage (ex: "GitHub"). */
  name: string
  /** "native" = géré par Composio ; "custom" = toolkit MCP du projet. */
  type: "native" | "custom"
  meta: {
    description?: string
    categories?: string[]
    logo?: string
    [key: string]: unknown
  }
  /** Liste des méthodes d'authentification supportées. */
  authSchemes?: Array<{ scheme: string; [key: string]: unknown }>
  /** URL du guide d'authentification de l'application. */
  authGuideUrl?: string | null
  /** Détails des configs d'auth possibles (géré Composio inclus). */
  authConfigDetails?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface ToolkitListResponse {
  current_page: number
  items: ToolkitItem[]
  total_items: number
  total_pages: number
  next_cursor?: string | null
}

export interface ToolkitListParams {
  search?: string
  category?: string
  limit?: number
  cursor?: string
  sort_by?: "usage" | "alphabetically"
  managed_by?: "composio" | "all" | "project"
  type?: "native" | "custom" | "all"
}

// ---------- Tools (actions) ----------

export interface ToolItem {
  /** Identifiant de l'action (ex: "GITHUB_STAR_A_REPOSITORY"). */
  slug: string
  /** Nom d'affichage. */
  name: string
  /** Description fonctionnelle détaillée. */
  description: string
  /** Schéma JSON des paramètres d'entrée. */
  input_parameters: Record<string, unknown>
  /** Schéma JSON des valeurs de sortie. */
  output_parameters: Record<string, unknown>
  /** L'action ne nécessite aucune connexion. */
  no_auth: boolean
  is_deprecated: boolean
  scopes: string[]
  /** Toolkit d'appartenance. */
  toolkit: { slug: string; name: string; [key: string]: unknown }
  [key: string]: unknown
}

export interface ToolListResponse {
  current_page: number
  items: ToolItem[]
  total_items: number
  total_pages: number
  next_cursor?: string | null
}

export interface ToolListParams {
  /** Slug du toolkit filtrant. */
  toolkit?: string
  /** Recherche plein texte (nom, slug, description). */
  query?: string
  limit?: number
  cursor?: string
  important?: "true" | "false"
  include_deprecated?: boolean
}

// ---------- Auth configs ----------

export interface AuthConfigItem {
  id: string
  name: string
  status: "ENABLED" | "DISABLED"
  toolkit: { slug: string; [key: string]: unknown }
  auth_scheme?: string
  [key: string]: unknown
}

export interface AuthConfigListResponse {
  current_page?: number
  items: AuthConfigItem[]
  total_items?: number
  total_pages?: number
}

// ---------- Connexions (connected accounts) ----------

export type ConnectedAccountStatus =
  | "INITIALIZING"
  | "INITIATED"
  | "ACTIVE"
  | "FAILED"
  | "EXPIRED"
  | "INACTIVE"
  | "REVOKED"

export interface ConnectedAccountItem {
  id: string
  alias: string | null
  status: ConnectedAccountStatus
  status_reason: string | null
  user_id: string
  is_disabled: boolean
  created_at: string
  updated_at: string
  toolkit: { slug: string; name: string; [key: string]: unknown }
  auth_config: { id: string; [key: string]: unknown }
  data: Record<string, unknown>
  [key: string]: unknown
}

export interface ConnectedAccountListResponse {
  current_page: number
  items: ConnectedAccountItem[]
  total_items: number
  total_pages: number
  next_cursor?: string | null
}

export interface ConnectedAccountListParams {
  toolkit?: string
  status?: ConnectedAccountStatus
  user_id?: string
  connected_account_ids?: string[]
  limit?: number
  cursor?: string
}

// ---------- Lien d'initiation OAuth ----------

export interface LinkCreateParams {
  auth_config_id: string
  user_id: string
  alias?: string
  /** URL de retour après complétion de l'authentification chez Composio. */
  callback_url?: string
}

export interface LinkCreateResponse {
  connected_account_id: string
  expires_at: string
  link_token: string
  redirect_url: string
}

// ---------- Exécution d'action ----------

export interface ToolExecuteParams {
  /** Arguments de l'action (schéma = input_parameters de l'action). */
  arguments?: Record<string, unknown>
  /** Compte connecté à utiliser (résolu sinon via user_id). */
  connected_account_id?: string
  /** Identifiant utilisateur Composio (résolution multi-comptes). */
  user_id?: string
}

export interface ToolExecuteResponse {
  data: Record<string, unknown> | null
  error: string | null
  successful: boolean
  log_id?: string
  [key: string]: unknown
}
