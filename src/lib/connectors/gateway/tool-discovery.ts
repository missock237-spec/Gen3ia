/**
 * Tool Discovery — découverte des apps/outils pour une tâche (ADR-0017).
 *
 * Deux usages :
 * 1. discoverConnectorTools(query) — recherche classée apps + outils
 *    (narrow apps d'abord, outils ensuite : 1467 apps puis les outils
 *    des apps candidates — jamais un scan brut des 51 240 outils) ;
 * 2. discoverySnapshotForUser(userId, analysis) — instantané prompt-ready
 *    pour le PLANNER : outils des apps connectées (clés exactes
 *    connector_\<app\>_\<action\> + niveau de risque) + apps connectables.
 *
    * C'est la brique qui manquait : le planner connaissait les 10 outils
 * statiques mais PAS les actions des apps connectées de l'utilisateur.
 */

import { getApp } from "../apps"
import { searchCatalog, type CatalogApp } from "../catalog"
import { connectorToolsForUser } from "../core/toolset"
import { listConnections } from "../core/connections"
import { getActiveComposioConnection } from "../composio/provider"
import { assessConnectorRisk } from "./risk-engine"
import type { RiskLevel } from "./types"

// ─────────────────────────────────────────────────────────────
// Recherche classée (API + UI)
// ─────────────────────────────────────────────────────────────

export interface DiscoveredApp {
  slug: string
  name: string
  logo: string
  category: string
  description: string
  toolCount: number
  score: number
  native: boolean
  connected: boolean
}

export interface DiscoveredTool {
  key: string
  appSlug: string
  appName: string
  actionSlug: string
  name: string
  description: string
  risk: RiskLevel
  local: boolean
}

export interface DiscoveryResult {
  terms: string[]
  apps: DiscoveredApp[]
  tools: DiscoveredTool[]
}

const STOP_WORDS = new Set([
  "les", "des", "une", "mon", "ma", "mes", "avec", "dans", "pour", "sur", "par",
  "et", "ou", "au", "aux", "ce", "cet", "cette", "que", "qui", "quoi", "the",
  "and", "for", "with", "from", "this", "that", "into", "find", "créer", "creer",
])

function tokenize(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // accents
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  )].slice(0, 8)
}

/** Applatis les métadonnées d'une app du catalogue en haystack. */
function appHaystack(app: CatalogApp): string {
  return `${app.name} ${app.slug} ${app.description ?? ""} ${app.category}`.toLowerCase()
}

/**
 * Découverte apps + outils pour une requête en langage naturel.
 * 1. score des apps (match complet > matches par terme) ;
 * 2. outils des meilleures apps (actions locales réelles en priorité,
 *    sinon outils du catalogue) filtrés par les termes restants.
 */
export async function discoverConnectorTools(
  query: string,
  opts: { userId?: string; limitApps?: number; limitTools?: number } = {}
): Promise<DiscoveryResult> {
  const limitApps = Math.min(12, Math.max(3, opts.limitApps ?? 8))
  const limitTools = Math.min(60, Math.max(5, opts.limitTools ?? 24))
  const terms = tokenize(query)

  // ── 1. Score des apps ────────────────────────────────────────
  const appIndex = new Map<string, CatalogApp>()
  const scores = new Map<string, number>()
  const addApp = (app: CatalogApp, points: number) => {
    appIndex.set(app.slug, app)
    scores.set(app.slug, (scores.get(app.slug) ?? 0) + points)
  }
  if (terms.length > 0) {
    // Match complet (tous les termes) : fort signal.
    const full = searchCatalog({ search: terms.join(" "), pageSize: 60 })
    for (const app of full.apps) addApp(app, 10)
    // Matches par terme : union avec comptage.
    for (const term of terms.slice(0, 5)) {
      const partial = searchCatalog({ search: term, pageSize: 60 })
      for (const app of partial.apps) {
        // Bonus si le terme touche le slug ou le nom exact.
        const strong = app.slug.includes(term) || app.name.toLowerCase().includes(term)
        addApp(app, strong ? 3 : 1)
      }
    }
  }

  const ranked = [...scores.entries()]
    .map(([slug, score]) => ({ app: appIndex.get(slug), slug, score }))
    .filter((r): r is { app: CatalogApp; slug: string; score: number } => r.app !== undefined)
    .sort((a, b) => b.score - a.score)
    .slice(0, limitApps)

  // ── 2. Connexions de l'utilisateur (enrichissement) ─────────
  const connectedSlugs = new Set<string>()
  if (opts.userId) {
    const local = await listConnections(opts.userId).catch(() => [])
    for (const c of local) {
      if (c.status === "ACTIVE") connectedSlugs.add(c.appSlug)
    }
    // Apps Composio hébergées connectées : sondées une à une seulement
    // parmi les candidates (pas de scan complet).
    for (const candidate of ranked) {
      if (connectedSlugs.has(candidate.slug)) continue
      const hosted = await getActiveComposioConnection(opts.userId, candidate.slug).catch(() => null)
      if (hosted) connectedSlugs.add(candidate.slug)
    }
  }

  // ── 3. Outils des apps candidates ────────────────────────────
  const tools: DiscoveredTool[] = []
  for (const { app, slug } of ranked) {
    const local = getApp(slug)
    const appName = app.name
    if (local && local.actions.length > 0) {
      // Actions locales réelles — exécutables immédiatement.
      for (const action of local.actions) {
        const hay = `${action.slug} ${action.name} ${action.description}`.toLowerCase()
        const relevant = terms.length === 0 || terms.some((t) => hay.includes(t))
        if (!relevant) continue
        const risk = assessConnectorRisk(slug, action.slug).level
        tools.push({
          key: `connector_${slug}_${action.slug}`,
          appSlug: slug,
          appName,
          actionSlug: action.slug,
          name: action.name,
          description: action.description,
          risk,
          local: true,
        })
        if (tools.length >= limitTools) break
      }
    }
    if (tools.length >= limitTools) break
  }

  // Complément catalogue (apps sans définition locale) : les quelques
  // premiers outils du catalogue pour élargir la découverte.
  if (tools.length < Math.min(12, limitTools)) {
    const { getCatalogTools } = await import("../catalog")
    for (const { app, slug } of ranked) {
      if (getApp(slug)) continue // déjà couvert par les actions locales
      const catalogTools = getCatalogTools(slug).tools.slice(0, 4)
      for (const t of catalogTools) {
        const hay = `${t.slug} ${t.name} ${t.description ?? ""}`.toLowerCase()
        const relevant = terms.length === 0 || terms.some((term) => hay.includes(term))
        if (!relevant) continue
        tools.push({
          key: `connector_${slug}_${t.slug}`,
          appSlug: slug,
          appName: app.name,
          actionSlug: t.slug,
          name: t.name,
          description: t.description ?? "",
          risk: assessConnectorRisk(slug, t.slug).level,
          local: false,
        })
        if (tools.length >= limitTools) break
      }
      if (tools.length >= limitTools) break
    }
  }

  return {
    terms,
    apps: ranked.map(({ app, slug, score }) => ({
      slug,
      name: app.name,
      logo: app.logo ?? "",
      category: app.category,
      description: app.description ?? "",
      toolCount: app.toolCount,
      score,
      native: !!getApp(slug),
      connected: connectedSlugs.has(slug),
    })),
    tools,
  }
}

// ─────────────────────────────────────────────────────────────
// Instantané pour le planner
// ─────────────────────────────────────────────────────────────

export interface DiscoverySnapshot {
  /** Lignes prompt-ready (clé + description + risque). */
  toolLines: string[]
  /** Apps connectables (non connectées) pertinentes pour la tâche. */
  appHints: string[]
  /** Clés d'outils valides citables dans requiredTools. */
  keys: string[]
}

function analysisTerms(analysis: {
  goals?: string[]
  requiredCapabilities?: string[]
  successCriteria?: string[]
}): string[] {
  const raw = [
    ...(analysis.goals ?? []),
    ...(analysis.requiredCapabilities ?? []),
    ...(analysis.successCriteria ?? []),
  ].join(" ")
  return tokenize(raw)
}

/**
 * Instantané de découverte pour le planning : outils réellement
 * connectés (exécutables maintenant) + apps connectables pertinentes.
 * Échec silencieux → null (le planner fonctionne sans, comme avant).
 */
export async function discoverySnapshotForUser(
  userId: string,
  analysis: { goals?: string[]; requiredCapabilities?: string[]; successCriteria?: string[] },
  allowedTools: string[],
  prompt?: string
): Promise<DiscoverySnapshot | null> {
  try {
    const terms = [...tokenize(prompt ?? ""), ...analysisTerms(analysis)].slice(0, 12)
    const connected = await connectorToolsForUser(userId, allowedTools)

    // Pertinence : description de l'outil vs termes de la tâche.
    const scored = connected
      .map((tool) => {
        const hay = `${tool.key} ${tool.description}`.toLowerCase()
        const hits = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
        return { tool, hits }
      })
      .sort((a, b) => b.hits - a.hits)

    const selected = scored.slice(0, 24)
    const toolLines = selected.map(({ tool }) => {
      const parsed = tool.key.startsWith("connector_") ? tool.key.slice("connector_".length) : tool.key
      const idx = parsed.indexOf("_")
      const appSlug = idx > 0 ? parsed.slice(0, idx) : parsed
      const actionSlug = idx > 0 ? parsed.slice(idx + 1) : "?"
      const risk = assessConnectorRisk(appSlug, actionSlug).level
      const flag = risk === "LOW" ? "" : ` [RISQUE ${risk} — confirmation requise avant exécution]`
      return `- ${tool.key} : ${tool.description}${flag}`
    })

    // Apps connectables pertinentes (non connectées).
    const connectedApps = new Set(connected.map((t) => t.key.replace(/^connector_/, "").split("_")[0]))
    const hints: string[] = []
    if (terms.length > 0) {
      const seen = new Set<string>()
      for (const term of terms.slice(0, 5)) {
        for (const app of searchCatalog({ search: term, pageSize: 12 }).apps) {
          if (connectedApps.has(app.slug) || seen.has(app.slug)) continue
          seen.add(app.slug)
          hints.push(`${app.slug} (${app.name}, ${app.toolCount} outils)`)
          if (hints.length >= 8) break
        }
        if (hints.length >= 8) break
      }
    }

    return { toolLines, appHints: hints, keys: selected.map(({ tool }) => tool.key) }
  } catch {
    return null
  }
}
