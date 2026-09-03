/**
 * Catalogue d'applications GEN3IA — 1467 apps, 51240 outils.
 *
 * Données réelles issues du catalogue public Composio
 * (dépôt ComposioHQ/composio, licence MIT — docs/public/data/toolkits.json),
 * reformatées en fichiers sources compacts (apps.json + tools/chunk-*.json)
 * par scripts/build-connectors-catalog.mjs.
 *
 * Ce module est côté serveur uniquement (données volumineuses chargées
 * à la demande — jamais dans le bundle client).
 */

import appsRaw from "./apps.json"
import toolsIndexRaw from "./tools-index.json"
import { TOOL_CHUNKS } from "./tools-chunks"
import type { ActionSpec, AppDefinition, AuthSchemeType } from "../core/types"
import { OAUTH_ENDPOINTS, type OAuthEndpointEntry } from "./endpoints"
import { buildDynamicApp } from "../apps/dynamic"

export interface CatalogApp {
  slug: string
  name: string
  logo: string | null
  description: string | null
  category: string
  authSchemes: string[]
  composioManaged: string[]
  toolCount: number
  triggerCount: number
  version: string | null
}

export interface CatalogTool {
  slug: string
  name: string
  description: string | null
}

const APPS = appsRaw as CatalogApp[]
const TOOLS_INDEX = toolsIndexRaw as Record<string, number>

type ChunkEntry = {
  slug: string
  tools: CatalogTool[]
  triggers: CatalogTool[]
}

// Lots importés statiquement (webpack-compatible) — accès O(1) par index.
const CHUNKS = TOOL_CHUNKS as unknown as ChunkEntry[][]

// ─────────────────────────────────────────────────────────────
// Statistiques du catalogue
// ─────────────────────────────────────────────────────────────

export function catalogStats() {
  const categories = new Map<string, number>()
  for (const a of APPS) categories.set(a.category, (categories.get(a.category) ?? 0) + 1)
  const totalTools = APPS.reduce((n, a) => n + a.toolCount, 0)
  const totalTriggers = APPS.reduce((n, a) => n + a.triggerCount, 0)
  const oauthCount = APPS.filter((a) => a.authSchemes.includes("OAUTH2")).length
  return {
    apps: APPS.length,
    tools: totalTools,
    triggers: totalTriggers,
    categories: [...categories.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    oauthApps: oauthCount,
  }
}

// ─────────────────────────────────────────────────────────────
// Recherche / filtrage / pagination
// ─────────────────────────────────────────────────────────────

export interface CatalogQuery {
  search?: string
  category?: string
  page?: number
  pageSize?: number
}

export interface CatalogResult {
  apps: CatalogApp[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function searchCatalog(q: CatalogQuery): CatalogResult {
  const search = (q.search ?? "").trim().toLowerCase()
  const category = q.category?.trim().toLowerCase()
  const page = Math.max(1, q.page ?? 1)
  const pageSize = Math.min(60, Math.max(6, q.pageSize ?? 24))

  let filtered = APPS
  if (category) filtered = filtered.filter((a) => a.category.toLowerCase() === category)
  if (search) {
    const terms = search.split(/\s+/).filter(Boolean)
    filtered = filtered.filter((a) => {
      const hay = `${a.name} ${a.slug} ${a.description ?? ""} ${a.category}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }

  const total = filtered.length
  const start = (page - 1) * pageSize
  return {
    apps: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export function getCatalogApp(slug: string): CatalogApp | null {
  return APPS.find((a) => a.slug === slug) ?? null
}

/** Outils + déclencheurs d'une app (chargés à la demande). */
export function getCatalogTools(slug: string): { tools: CatalogTool[]; triggers: CatalogTool[] } {
  const idx = TOOLS_INDEX[slug]
  if (idx === undefined) return { tools: [], triggers: [] }
  const entry = CHUNKS[idx]?.find((a) => a.slug === slug)
  return { tools: entry?.tools ?? [], triggers: entry?.triggers ?? [] }
}

// ─────────────────────────────────────────────────────────────
// Disponibilité « prêt à connecter » (modèle Composio managé)
// ─────────────────────────────────────────────────────────────

export type CatalogConnectivity =
  | { status: "NATIVE"; appDefinition: AppDefinition } // 13 apps aux actions natives
  | { status: "OAUTH_READY"; endpoint: OAuthEndpointEntry } // endpoints réels connus
  | { status: "KEY_IMPORT" } // auth par clé API utilisateur
  | { status: "COMING_SOON" }

/**
 * Résout la connectivité d'une app du catalogue :
 * 1. app native GEN3IA (actions exécutables) ;
 * 2. endpoints OAuth réels connus (registre + identifiants plateforme) ;
 * 3. import de clé API (le fournisseur n'offre que des clés) ;
 * 4. catalogue en attente d'activation opérateur.
 */
export function connectivity(slug: string): CatalogConnectivity {
  // 1. Native ? (résolue par le registre local, y compris dynamique)
  const native = buildDynamicApp(slug)
  if (native && native.actions.length > 0) return { status: "NATIVE", appDefinition: native }
  if (native) return { status: "OAUTH_READY", endpoint: OAUTH_ENDPOINTS[slug] }

  const entry = OAUTH_ENDPOINTS[slug]
  if (entry) return { status: "OAUTH_READY", endpoint: entry }

  const app = getCatalogApp(slug)
  if (!app) return { status: "COMING_SOON" }

  const schemes = app.authSchemes.length ? app.authSchemes : ["API_KEY"]
  if (schemes.some((s) => s === "OAUTH2" || s === "OAUTH1")) {
    return { status: "COMING_SOON" } // OAuth réel : endpoints non référencés → admin peut les saisir
  }
  return { status: "KEY_IMPORT" }
}

/** Mappe les catégories du catalogue → catégories internes. */
export function mapCategory(catalogCategory: string): AppDefinition["category"] {
  const c = catalogCategory.toLowerCase()
  if (c.includes("developer") || c.includes("dev")) return "DEVELOPMENT"
  if (c.includes("communication") || c.includes("email") || c.includes("chat") || c.includes("social"))
    return "COMMUNICATION"
  if (c.includes("productiv") || c.includes("project") || c.includes("document") || c.includes("scheduling"))
    return "PRODUCTIVITY"
  if (c.includes("crm") || c.includes("sales") || c.includes("marketing") || c.includes("support"))
    return "CRM"
  if (c.includes("payment") || c.includes("account") || c.includes("ecommerce")) return "PAYMENTS"
  if (c.includes("data") || c.includes("database") || c.includes("analytics")) return "DATA"
  return "CLOUD"
}

/** Schéma d'authentification interne depuis le schéma catalogue. */
export function mapAuthScheme(schemes: string[]): AuthSchemeType {
  if (schemes.includes("OAUTH2")) return "OAUTH2"
  if (schemes.includes("OAUTH1")) return "OAUTH1"
  if (schemes.includes("GOOGLE_SERVICE_ACCOUNT")) return "GOOGLE_SERVICE_ACCOUNT"
  if (schemes.includes("BASIC")) return "BASIC"
  if (schemes.includes("BEARER_TOKEN")) return "BEARER_TOKEN"
  return "API_KEY"
}

export type { OAuthEndpointEntry }
