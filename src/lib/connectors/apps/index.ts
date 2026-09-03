/**
 * Registre des applications connectables — l'équivalent local du
 * catalogue de toolkits Composio. Chaque app est reconstruite à
 * l'appel (lecture d'environnement à chaud : aucune valeur figée
 * au chargement du module, compatible Vercel/serverless).
 */

import type { AppDefinition, ActionSpec } from "../core/types"
import { isRedirectableAuthScheme } from "../core/types"
import { githubApp } from "./github"
import { slackApp } from "./slack"
import { gmailApp, calendarApp } from "./google"
import { notionApp, discordApp } from "./notion-discord"
import { trelloApp, jiraApp } from "./trello-jira"
import { linearApp, airtableApp } from "./linear-airtable"
import { telegramApp, stripeApp, twitterApp } from "./telegram-stripe-twitter"
import { buildDynamicApp } from "./dynamic"
import { getCatalogApp } from "../catalog"

/** Fabriques : l'environnement est lu à CHAQUE appel (jamais au module-load). */
const APP_FACTORIES: Array<() => AppDefinition> = [
  githubApp,
  slackApp,
  gmailApp,
  calendarApp,
  notionApp,
  discordApp,
  trelloApp,
  jiraApp,
  linearApp,
  airtableApp,
  telegramApp,
  stripeApp,
  twitterApp,
]

/** Retourne la définition fraîche d'une application (native puis dynamique). */
export function getApp(appSlug: string): AppDefinition | null {
  for (const factory of APP_FACTORIES) {
    const app = factory()
    if (app.slug === appSlug) return app
  }
  // Application dynamique du catalogue (1467 apps) : résolue à l'exécution.
  return buildDynamicApp(appSlug)
}

export function listApps(): AppDefinition[] {
  return APP_FACTORIES.map((f) => f())
}

/** Retourne une action précise d'une app. */
export function getAction(appSlug: string, actionSlug: string): { app: AppDefinition; action: ActionSpec } | null {
  const app = getApp(appSlug)
  if (!app) return null
  const action = app.actions.find((a) => a.slug === actionSlug)
  if (!action) return null
  return { app, action }
}

// ─────────────────────────────────────────────────────────────
// Disponibilité : l'app est-elle connectable maintenant ?
// ─────────────────────────────────────────────────────────────

export interface AppAvailability {
  /** Connexion OAuth (ou token import) possible. */
  connectable: boolean
  /** L'app est pré-configurée par variables d'environnement. */
  envConfigured: boolean
  /** Mode de connexion suggéré. */
  mode: "OAUTH" | "TOKEN_IMPORT" | "CREDENTIALS" | "UNAVAILABLE"
  /** Variables d'environnement attendues (affichage UI). */
  requiredEnvVars: string[]
  reason?: string
}

/**
 * Vérifie si une app est prête à être connectée. Priorité :
 * 1. OAuth2 préconfiguré (env) → mode OAUTH ;
 * 2. OAuth1 préconfiguré (env) → mode OAUTH ;
 * 3. import de token utilisateur → TOKEN_IMPORT ;
 * 4. identifiants fournis à la connexion → CREDENTIALS.
 */
export function appAvailability(app: AppDefinition): AppAvailability {
  if (app.authScheme === "OAUTH2" && app.oauth2) {
    const ok = app.oauth2.clientId.length > 0 && app.oauth2.clientSecret.length > 0
    if (ok) {
      return { connectable: true, envConfigured: true, mode: "OAUTH", requiredEnvVars: [] }
    }
  }
  if (app.authScheme === "OAUTH1" && app.oauth1) {
    const ok = app.oauth1.consumerKey.length > 0 && app.oauth1.consumerSecret.length > 0
    if (ok) {
      return { connectable: true, envConfigured: true, mode: "OAUTH", requiredEnvVars: [] }
    }
  }
  // 1. Import de token utilisateur : toujours possible dès que
  // l'app le supporte (l'utilisateur fournit sa clé via l'UI).
  if (app.supportsTokenImport) {
    return {
      connectable: true,
      envConfigured: false,
      mode: "TOKEN_IMPORT",
      requiredEnvVars: app.apiKeyEnv?.envVars ?? [],
      reason: "Import de token utilisateur",
    }
  }
  // 2. Basic (Jira) : identifiants fournis par l'utilisateur à la connexion.
  if (app.authScheme === "BASIC") {
    return {
      connectable: true,
      envConfigured: false,
      mode: "CREDENTIALS",
      requiredEnvVars: [],
      reason: "Identifiants fournis à la connexion",
    }
  }
  // 3. Clé serveur via env (Bearer/API_KEY sans import utilisateur).
  if (app.apiKeyEnv) {
    const present = app.apiKeyEnv.envVars.find((v) => (process.env[v] ?? "").length > 0)
    return {
      connectable: !!present,
      envConfigured: !!present,
      mode: present ? "OAUTH" : "UNAVAILABLE",
      requiredEnvVars: app.apiKeyEnv.envVars,
      reason: present ? "Clé serveur détectée" : `Aucune clé : définir ${app.apiKeyEnv.envVars.join(" ou ")}.`,
    }
  }
  return {
    connectable: false,
    envConfigured: false,
    mode: "UNAVAILABLE",
    requiredEnvVars: envVarNamesFor(app, ["CLIENT_ID", "CLIENT_SECRET"]),
    reason: isRedirectableAuthScheme(app.authScheme)
      ? "Client OAuth non configuré (variables d'environnement absentes)."
      : "Schéma non supporté.",
  }
}

function envVarNamesFor(app: AppDefinition, suffixes: string[]): string[] {
  const prefix = app.slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")
  return suffixes.map((s) => `${prefix}_${s}`)
}

/** L'app exige-t-elle un flux par redirection ? */
export function requiresRedirect(app: AppDefinition): boolean {
  return isRedirectableAuthScheme(app.authScheme)
}

// ─────────────────────────────────────────────────────────────
// v3.4 — Applications dynamiques du catalogue (Composio-like)
// ─────────────────────────────────────────────────────────────

import { ensureDynamicApps as refreshDynamic, registrySlugs } from "./dynamic"

/** Liste toutes les apps natives + dynamiques résolues (cache/DB). */
export function listAllApps(): AppDefinition[] {
  const natives = APP_FACTORIES.map((f) => f())
  const nativesBySlug = new Set(natives.map((a) => a.slug))
  const dynamics: AppDefinition[] = []
  for (const slug of registrySlugs()) {
    if (nativesBySlug.has(slug)) continue
    const dyn = buildDynamicApp(slug)
    if (dyn) dynamics.push(dyn)
  }
  return [...natives, ...dynamics]
}

/** Pré-charge les identifiants dynamiques (routes API — appel à chaud). */
export async function ensureCatalogApps(): Promise<void> {
  await refreshDynamic()
}

/** Vérifie qu'un slug existe dans le catalogue étendu (natif + catalogue). */
export function isKnownAppSlug(appSlug: string): boolean {
  return getApp(appSlug) !== null || getCatalogApp(appSlug) !== null
}
