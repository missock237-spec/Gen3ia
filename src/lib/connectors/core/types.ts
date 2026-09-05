/**
 * GEN3IA Connectors — Types du moteur de connexions applicatives.
 *
 * Architecture adaptée du projet Composio (https://github.com/ComposioHQ/composio)
 * — licence MIT, Copyright (c) 2025 Sampark Inc. Les schémas d'authentification,
 * les états de connexion et le modèle toolkit/action reprennent la sémantique de
 * `ts/packages/core/src/types/{authConfigs,connectedAccountAuthStates,toolkit,tool}.types.ts`
 * et sont réimplémentés pour une exécution 100 % locale dans GEN3IA :
 * aucune requête n'est envoyée à une plateforme tierce.
 */

// ─────────────────────────────────────────────────────────────
// Schémas d'authentification (portés de Composio AuthSchemeTypes)
// ─────────────────────────────────────────────────────────────

export const AuthSchemeTypes = {
  OAUTH1: "OAUTH1",
  OAUTH2: "OAUTH2",
  API_KEY: "API_KEY",
  BASIC: "BASIC",
  BEARER_TOKEN: "BEARER_TOKEN",
  GOOGLE_SERVICE_ACCOUNT: "GOOGLE_SERVICE_ACCOUNT",
  NO_AUTH: "NO_AUTH",
} as const;
export type AuthSchemeType = (typeof AuthSchemeTypes)[keyof typeof AuthSchemeTypes];

/** Schémas nécessitant une redirection (browser) pour la connexion. */
export const REDIRECTABLE_AUTH_SCHEMES: readonly AuthSchemeType[] = [
  AuthSchemeTypes.OAUTH1,
  AuthSchemeTypes.OAUTH2,
];

export function isRedirectableAuthScheme(s: AuthSchemeType): boolean {
  return REDIRECTABLE_AUTH_SCHEMES.includes(s);
}

// ─────────────────────────────────────────────────────────────
// États de connexion (portés de Composio ConnectionStatuses)
// ─────────────────────────────────────────────────────────────

export const ConnectionStatuses = {
  INITIALIZING: "INITIALIZING",
  INITIATED: "INITIATED",
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
export type ConnectionStatusEnum = (typeof ConnectionStatuses)[keyof typeof ConnectionStatuses];

// ─────────────────────────────────────────────────────────────
// ConnectionData — charge utile persistée (chiffrée) d'un compte
// connecté. Sémantique portée de Composio
// connectedAccountAuthStates.types.ts (Oauth2ActiveConnectionDataSchema
// & co), reformulée en union discriminée TypeScript.
// ─────────────────────────────────────────────────────────────

export type ConnectionData =
  | OAuth2ConnectionData
  | OAuth1ConnectionData
  | ApiKeyConnectionData
  | BasicConnectionData
  | BearerTokenConnectionData
  | GoogleServiceAccountConnectionData
  | NoAuthConnectionData;

/** Champs communs : identifiants d'instance (portés de Composio BaseSchemeRaw). */
export interface BaseConnectionFields {
  /** Sous-domaine d'instance (freshdesk, zendesk, clickup…). */
  subdomain?: string;
  /** Domaine Atlassian (jira). */
  "your-domain"?: string;
  /** Région d'hébergement (mixpanel, zoho…). */
  region?: string;
  /** Boutique (shopify). */
  shop?: string;
  /** URL d'instance (snowflake, salesforce…). */
  instanceEndpoint?: string;
  /** Base d'API générique (airtable, notion enterprise…). */
  api_url?: string;
  /** Datacenter (mailchimp). */
  dc?: string;
  /** Nom d'instance (servicenow, jira serve…). */
  instanceName?: string;
  /** Identifiant de compte (netsuite…). */
  account_id?: string;
  /** URL de serveur personnalisé (API self-hosted). */
  your_server?: string;
  /** URL de base de l'API cible. */
  base_url?: string;
}

export interface OAuth2ConnectionData extends BaseConnectionFields {
  authScheme: "OAUTH2";
  status: ConnectionStatusEnum;
  access_token?: string;
  token_type?: string;
  id_token?: string;
  refresh_token?: string | null;
  /** TTL en secondes (RFC 6749 §4.2.2). */
  expires_in?: number | null;
  /** Date d'expiration absolue (ISO) recalculée à l'échange. */
  expires_at?: string | null;
  scope?: string | null;
  /** Slack : tokens utilisateur distincts des tokens bot. */
  authed_user?: { access_token?: string; scope?: string } | null;
  /** Error signalée par le fournisseur (callback `?error=`). */
  error?: string;
  error_description?: string;
}

export interface OAuth1ConnectionData extends BaseConnectionFields {
  authScheme: "OAUTH1";
  status: ConnectionStatusEnum;
  oauth_token?: string;
  oauth_token_secret?: string;
  consumer_key?: string;
  error?: string;
  error_description?: string;
}

export interface ApiKeyConnectionData extends BaseConnectionFields {
  authScheme: "API_KEY";
  status: ConnectionStatusEnum;
  api_key?: string;
}

export interface BasicConnectionData extends BaseConnectionFields {
  authScheme: "BASIC";
  status: ConnectionStatusEnum;
  username?: string;
  password?: string;
}

export interface BearerTokenConnectionData extends BaseConnectionFields {
  authScheme: "BEARER_TOKEN";
  status: ConnectionStatusEnum;
  bearer_token?: string;
}

export interface GoogleServiceAccountConnectionData extends BaseConnectionFields {
  authScheme: "GOOGLE_SERVICE_ACCOUNT";
  status: ConnectionStatusEnum;
  /** Contenu intégral du JSON de compte de service. */
  credentials_json?: string;
  /** Email du compte de service (replay/audit). */
  client_email?: string;
  /** Access token dérivé du JWT RS256 (RFC 7523) — jamais stocké en clair. */
  access_token?: string;
  expires_at?: string | null;
  error?: string;
}

export interface NoAuthConnectionData extends BaseConnectionFields {
  authScheme: "NO_AUTH";
  status: ConnectionStatusEnum;
}

// ─────────────────────────────────────────────────────────────
// Spécifications d'action — équivalent local des OpenAPI specs
// de Composio : chaque action décrit UNE opération d'API réelle.
// ─────────────────────────────────────────────────────────────

/** Style d'injection des identifiants dans la requête HTTP. */
export type AuthInjectionStyle =
  | { style: "bearer" } // Authorization: Bearer <token>
  | { style: "basic" } // Authorization: Basic base64(user:pass)
  | { style: "oauth1" } // signature OAuth 1.0a (HMAC-SHA1) par requête
  | { style: "header"; name: string; template: string } // en-tête arbitraire avec template {{token}}
  | { style: "query"; name: string; template: string } // paramètre d'URL {{token}}
  | { style: "body"; path?: string } // injecté dans le corps (ex. Slack chat.postMessage)
  | { style: "pathPrefix"; template: string } // préfixe de chemin (Telegram /bot<token>/…)
  | { style: "none" };

/** Type de paramètre (JSON Schema simplifié, suffisant pour le LLM). */
export type ActionParamType = "string" | "number" | "integer" | "boolean" | "enum" | "array" | "object";

export interface ActionParam {
  name: string;
  type: ActionParamType;
  description: string;
  required: boolean;
  /** Valeurs autorisées (type enum). */
  enum?: string[];
  /** Emplacement du paramètre dans la requête. */
  in: "path" | "query" | "body" | "header";
  /** Valeur par défaut. */
  default?: string | number | boolean;
}

/** Description déclarative d'une action — exécutée par le moteur HTTP. */
export interface ActionSpec {
  slug: string;
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Chemin relatif au baseUrl de l'app, paramètres {path}. */
  path: string;
  params: ActionParam[];
  /** Corps de requête : les paramètres `in: body` y sont sérialisés en JSON. */
  bodyContentType?: "json" | "form";
  /** Injection des identifiants. Défaut : bearer. */
  auth?: AuthInjectionStyle;
  /** En-têtes additionnels statiques. */
  headers?: Record<string, string>;
  /**
   * Transformation des paramètres AVANT construction de la requête —
   * pour les conventions non génériques : encodage RFC 2822 (Gmail),
   * construction de requêtes GraphQL (Linear) depuis des arguments
   * structurés, etc. Reçoit les params validés + la connexion.
   */
  prepare?: (
    params: Record<string, unknown>,
    data: ConnectionData
  ) => Record<string, unknown>;
  /** Troncature de la réponse textuelle (défaut 6000). */
  maxOutputChars?: number;
}

// ─────────────────────────────────────────────────────────────
// Définition d'une application (toolkit) — équivalent local du
// modèle Toolkit de Composio, avec auth et actions réelles.
// ─────────────────────────────────────────────────────────────

/** Configuration OAuth2 d'une app (client credentials — env only). */
export interface OAuth2ProviderConfig {
  clientId: string;
  clientSecret: string;
  /** URL d'autorisation. */
  authorizeUrl: string;
  /** URL d'échange de code. */
  tokenUrl: string;
  /** URL de révocation (optionnelle). */
  revokeUrl?: string;
  /** Scopes demandés. */
  scopes: string[];
  /** Scopes utilisateur séparés (Slack user scopes). */
  userScopes?: string[];
  /** PKCE requis (X, Google…) — S256. */
  usePkce?: boolean;
  /** Paramètres additionnels à l'autorisation (ex. Google access_type=offline). */
  extraAuthorizeParams?: Record<string, string>;
  /** Paramètres additionnels à l'échange de token. */
  extraTokenParams?: Record<string, string>;
  /**
   * Persistance du refresh_token : certains fournisseurs (Google)
   * ne renvoient refresh_token qu'avec prompt=consent.
   */
  alwaysPromptConsent?: boolean;
}

/** Configuration OAuth1 (request/token endpoints + clés consommateur). */
export interface OAuth1ProviderConfig {
  consumerKey: string;
  consumerSecret: string;
  requestTokenUrl: string;
  authorizeUrl: string;
  accessTokenUrl: string;
  /** Méthode de signature (RFC 5849 §3.4) — seule HMAC-SHA1 est supportée. */
  signatureMethod: "HMAC-SHA1";
}

/** Lecture des identifiants d'API depuis l'environnement. */
export interface ApiKeyEnvConfig {
  /** Variables candidates (ex: GITHUB_API_KEY, GITHUB_TOKEN). */
  envVars: string[];
  /** Libellé affiché dans l'UI. */
  label: string;
}

export interface AppDefinition {
  slug: string;
  name: string;
  description: string;
  category:
    | "DEVELOPMENT"
    | "COMMUNICATION"
    | "PRODUCTIVITY"
    | "CRM"
    | "PAYMENTS"
    | "SOCIAL"
    | "DATA"
    | "CLOUD";
  /** Logo (emoji) pour l'UI. */
  logo: string;
  docsUrl: string;
  /** Base d'API commune à toutes les actions. */
  baseUrl: string;
  /** Schéma d'authentification principal. */
  authScheme: AuthSchemeType;
  /** Config OAuth2 si authScheme = OAUTH2. */
  oauth2?: OAuth2ProviderConfig;
  /** Config OAuth1 si authScheme = OAUTH1. */
  oauth1?: OAuth1ProviderConfig;
  /** Variables d'env supportées pour un mode API_KEY (import de token). */
  apiKeyEnv?: ApiKeyEnvConfig;
  /** Support d'un import direct de token par l'utilisateur (personal access token). */
  supportsTokenImport?: boolean;
  /** Injection des identifiants pour le mode token importé. */
  tokenImportAuth?: AuthInjectionStyle;
  /** Actions réelles de l'application. */
  actions: ActionSpec[];
}

// ─────────────────────────────────────────────────────────────
// Compte connecté (vue service, secret déchiffré en mémoire)
// ─────────────────────────────────────────────────────────────

export interface ConnectedAccountMeta {
  scopes?: string | null;
  accountHint?: string | null;
  tokenExpiresAt?: string | null;
}

export interface ConnectedAccountView {
  id: string;
  userId: string;
  appSlug: string;
  status: ConnectionStatusEnum;
  authScheme: AuthSchemeType;
  data: ConnectionData;
  meta: ConnectedAccountMeta | null;
  createdAt: Date;
  updatedAt: Date;
  lastRefreshAt: Date | null;
  lastError: string | null;
}

// ─────────────────────────────────────────────────────────────
// Exécution d'action
// ─────────────────────────────────────────────────────────────

export interface ActionExecutionRequest {
  userId: string;
  appSlug: string;
  actionSlug: string;
  params: Record<string, unknown>;
  agentId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Clés d'outils connector (partagées local + Composio hébergé)
// Déplacées ici (module sans dépendance) : le provider Composio et
// le toolset les utilisent sans dépendance circulaire.
// ─────────────────────────────────────────────────────────────

/** Préfixe réservé des outils connector. */
export const CONNECTOR_TOOL_PREFIX = "connector_";

/** Clé d'outil canonique d'une action (ex: connector_github_create_issue). */
export function connectorToolKey(appSlug: string, actionSlug: string): string {
  return `${CONNECTOR_TOOL_PREFIX}${appSlug}_${actionSlug}`;
}

/** Parse une clé d'outil connector → { app, action } (null sinon). */
export function parseConnectorToolKey(
  key: string
): { appSlug: string; actionSlug: string } | null {
  if (!key.startsWith(CONNECTOR_TOOL_PREFIX)) return null;
  const rest = key.slice(CONNECTOR_TOOL_PREFIX.length);
  const separator = rest.indexOf("_");
  if (separator <= 0) return null;
  return { appSlug: rest.slice(0, separator), actionSlug: rest.slice(separator + 1) };
}

/** Outil LLM exposé par le moteur connectors (format registre GEN3IA). */
export interface ConnectorTool {
  key: string;
  name: string;
  description: string;
  category: string;
  dangerous: boolean;
  parameters: Record<string, { type: string; description: string; required: boolean }>;
}

export interface ActionExecutionResponse {
  ok: boolean;
  status: number;
  statusText: string;
  /** Corps de réponse parsé (JSON) ou texte brut. */
  data: unknown;
  /** Troncature textuelle pour le contexte LLM. */
  output: string;
  latencyMs: number;
  error?: string;
  /** Compte utilisé (après rafraîchissement éventuel du token). */
  connectionId: string;
  actionSlug: string;
  appSlug: string;
}
