/**
 * Apps dynamiques du catalogue — résolution à l'exécution.
 *
 * Une app « dynamique » est une app du catalogue (1467) dont la définition
 * n'est pas codée en dur : elle est reconstruite à partir de
 *   1. du registre d'endpoints OAuth réels (catalog/endpoints.ts) ;
 *   2. des identifiants de client OAuth enregistrés par l'OPÉRATEUR de la
 *      plateforme (table OAuthAppConfig — modèle « auth gérée » de Composio,
 *      en self-hosted) ou des variables d'environnement ;
 *   3. d'actions exécutables générées d'une spécification OpenAPI
 *      (attachée par l'opérateur, convertie en ActionSpec réelles).
 *
 * L'utilisateur final clique « Connecter », autorise son compte, c'est fini.
 * Aucun jeton à chercher, aucune configuration utilisateur.
 */

import type { ActionSpec, AppDefinition, AuthInjectionStyle } from "../core/types"
import { getCatalogApp, mapCategory, mapAuthScheme } from "../catalog"
import { OAUTH_ENDPOINTS, type OAuthEndpointEntry } from "../catalog/endpoints"
import { decryptJson } from "../core/crypto"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

interface DynamicExtraConfig {
  /** Actions réelles générées d'une spec OpenAPI. */
  actions?: ActionSpec[]
  /** Endpoints personnalisés (saisis par l'opérateur pour une app non référencée). */
  endpoints?: {
    authorizeUrl: string
    tokenUrl: string
    refreshUrl?: string
    revokeUrl?: string
    baseUrl: string
    scope?: string
    usePkce?: boolean
    authStyle?: "bearer" | "query_token" | "basic"
    tokenQueryParam?: string
    apiHeaders?: Record<string, string>
    docsUrl?: string
  }
  /** Scopes surchargés (CSV). */
  scopes?: string
}

/** Cache en mémoire des apps dynamiques résolues (TTL court, serverless-friendly). */
const CACHE = new Map<string, AppDefinition>()
const CACHE_STATE = { loadedAt: 0, loading: null as Promise<void> | null, ttlMs: 30_000 }

// ─────────────────────────────────────────────────────────────
// Résolution des identifiants du client OAuth
// ─────────────────────────────────────────────────────────────

interface ClientCredentials {
  clientId: string
  clientSecret: string
  source: "db" | "env"
}

function envCredentialNames(slug: string): Array<[string, string]> {
  const upper = slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")
  return [
    [`${upper}_CLIENT_ID`, `${upper}_CLIENT_SECRET`],
    [`AUTH_${upper}_CLIENT_ID`, `AUTH_${upper}_CLIENT_SECRET`],
  ]
}

function credentialsFromEnv(slug: string): ClientCredentials | null {
  for (const [idVar, secretVar] of envCredentialNames(slug)) {
    const clientId = process.env[idVar]
    const clientSecret = process.env[secretVar]
    if (clientId && clientSecret) return { clientId, clientSecret, source: "env" }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// Construction d'une définition dynamique
// ─────────────────────────────────────────────────────────────

function authStyleInjection(entry: OAuthEndpointEntry): AuthInjectionStyle {
  switch (entry.authStyle) {
    case "query_token":
      return { style: "query", name: entry.tokenQueryParam ?? "token", template: "{{token}}" }
    case "basic":
      return { style: "basic" }
    default:
      return { style: "bearer" }
  }
}

interface DynamicSource {
  credentials: ClientCredentials | null
  extra: DynamicExtraConfig | null
}

function buildFromSources(slug: string, source: DynamicSource): AppDefinition | null {
  const catalogApp = getCatalogApp(slug)
  const rawEndpoints = source.extra?.endpoints ?? OAUTH_ENDPOINTS[slug] ?? null
  if (!catalogApp || !rawEndpoints) return null
  // Normalisation vers OAuthEndpointEntry (docsUrl optionnel côté opérateur).
  const reference = OAUTH_ENDPOINTS[slug]
  const endpoints: OAuthEndpointEntry = reference
    ? { ...reference, ...rawEndpoints, docsUrl: rawEndpoints.docsUrl ?? reference.docsUrl }
    : {
        authorizeUrl: rawEndpoints.authorizeUrl,
        tokenUrl: rawEndpoints.tokenUrl,
        refreshUrl: rawEndpoints.refreshUrl,
        revokeUrl: rawEndpoints.revokeUrl,
        scope: rawEndpoints.scope ?? "",
        usePkce: rawEndpoints.usePkce ?? false,
        authStyle: rawEndpoints.authStyle ?? "bearer",
        tokenQueryParam: rawEndpoints.tokenQueryParam,
        apiHeaders: rawEndpoints.apiHeaders,
        baseUrl: rawEndpoints.baseUrl,
        docsUrl: rawEndpoints.docsUrl ?? `https://developers.${slug}.com`,
      }

  // App cataloguée sans schéma OAuth (API key / no auth) : connexion par clé.
  const schemes = catalogApp.authSchemes.length ? catalogApp.authSchemes : ["API_KEY"]
  const isOAuth = schemes.includes("OAUTH2") || !!source.extra?.endpoints || !!OAUTH_ENDPOINTS[slug]
  if (!isOAuth) {
    return {
      slug,
      name: catalogApp.name,
      description: catalogApp.description ?? "",
      category: mapCategory(catalogApp.category),
      logo: catalogApp.logo ?? "🔌",
      docsUrl: endpoints.docsUrl ?? `https://${slug}.com`,
      baseUrl: endpoints.baseUrl,
      authScheme: "API_KEY",
      supportsTokenImport: true,
      tokenImportAuth: authStyleInjection(endpoints),
      actions: [],
    }
  }

  const cred = source.credentials
  const scopes = (source.extra?.scopes ?? endpoints.scope ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)

  const app: AppDefinition = {
    slug,
    name: catalogApp.name,
    description: catalogApp.description ?? "",
    category: mapCategory(catalogApp.category),
    logo: catalogApp.logo ?? "🔌",
    docsUrl: endpoints.docsUrl ?? `https://${slug}.com`,
    baseUrl: endpoints.baseUrl,
    authScheme: mapAuthScheme(schemes),
    oauth2: {
      clientId: cred?.clientId ?? "",
      clientSecret: cred?.clientSecret ?? "",
      authorizeUrl: endpoints.authorizeUrl,
      tokenUrl: endpoints.tokenUrl,
      revokeUrl: endpoints.revokeUrl,
      scopes,
      usePkce: endpoints.usePkce ?? false,
    },
    supportsTokenImport: true,
    tokenImportAuth: authStyleInjection(endpoints),
    actions: source.extra?.actions ?? [],
  }

  // Instance avec placeholders {subdomain}/{shop}/{dc} : l'utilisateur
  // renseigne son instance à la connexion (formulaire dynamique).
  if (/\{(subdomain|shop|dc|your-domain|instanceEndpoint)\}/.test(endpoints.baseUrl)) {
    ;(app as AppDefinition & { instanceField?: string }).instanceField = "subdomain"
  }
  return app
}

/** Résolution synchrone : cache mémoire, sinon env uniquement. */
export function buildDynamicApp(slug: string): AppDefinition | null {
  const cached = CACHE.get(slug)
  if (cached) return cached
  // Résolution env-only (serverless à froid, avant chargement DB).
  return buildFromSources(slug, { credentials: credentialsFromEnv(slug), extra: null })
}

/**
 * Rafraîchit le cache des apps dynamiques depuis OAuthAppConfig (DB).
 * Idempotent, TTL 30 s — appelé par les routes connectors avant toute
 * résolution. Les secrets sont déchiffrés (AES-256-GCM) au chargement.
 */
export async function ensureDynamicApps(): Promise<void> {
  if (Date.now() - CACHE_STATE.loadedAt < CACHE_STATE.ttlMs) return
  if (CACHE_STATE.loading) return CACHE_STATE.loading

  CACHE_STATE.loading = (async () => {
    try {
      const rows = await db.oAuthAppConfig.findMany({ where: { active: true } })
      for (const row of rows) {
        try {
          const secret = decryptJson<{ clientSecret: string }>(row.clientSecret)
          let extra: DynamicExtraConfig | null = null
          if (row.extraConfig) {
            try {
              extra = JSON.parse(row.extraConfig) as DynamicExtraConfig
            } catch {
              extra = null
            }
          }
          const scopesOverride = row.scopes ? { scopes: row.scopes } : null
          const merged = extra ?? {}
          const source: DynamicExtraConfig = { ...merged, ...(scopesOverride ?? {}) }
          const app = buildFromSources(row.appSlug, {
            credentials: { clientId: row.clientId, clientSecret: secret.clientSecret, source: "db" },
            extra: source,
          })
          if (app) CACHE.set(row.appSlug, app)
        } catch (err) {
          logger.warn(`[dynamic] OAuthAppConfig ${row.appSlug} illisible`, {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      CACHE_STATE.loadedAt = Date.now()
    } finally {
      CACHE_STATE.loading = null
    }
  })()
  return CACHE_STATE.loading
}

/** Invalide le cache (après écriture admin). */
export function invalidateDynamicCache(): void {
  CACHE.clear()
  CACHE_STATE.loadedAt = 0
}

/** Slugs du catalogue référencés dans le registre d'endpoints (sync). */
export function registrySlugs(): string[] {
  return Object.keys(OAUTH_ENDPOINTS)
}
