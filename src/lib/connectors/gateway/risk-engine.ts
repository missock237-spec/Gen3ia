/**
 * Risk Engine — évaluation du risque d'une action connecteur (ADR-0017).
 *
 * Chaque appel est noté 0-100 avec des facteurs EXPLICITES (auditables) :
 *   - méthode HTTP (lecture / création / mutation / suppression) ;
 *   - sémantique du slug (send, publish, delete, merge, create…) ;
 *   - catégorie de l'app (finance : paiements) ;
 *   - amplificateurs de paramètres (diffusion massive, montants).
 *
 * Niveaux : LOW 0-29 · MEDIUM 30-59 · HIGH 60-79 · CRITICAL 80-100.
 *
 * Le moteur est SYNCHRONE et sans base : résolution locale → catalogue
 * → heuristique de slug (actions Composio hébergées comprises).
 */

import { getAction, getApp } from "../apps"
import { getCatalogApp, getCatalogTools } from "../catalog"
import type { RiskAssessment, RiskLevel } from "./types"
import { riskLevelFromScore } from "./types"

// ─────────────────────────────────────────────────────────────
// Préfixes sémantiques (insensibles à la casse — slug locaux et
// outils Composio "GMAIL_SEND_EMAIL" partagent le même vocabulaire)
// ─────────────────────────────────────────────────────────────

/** Sémantique verbale — recherche par MOT (séparateurs _), compatible avec les
 * slugs locaux (create_issue) ET les slugs Composio préfixés par l'app
 * (GITHUB_CREATE_ISSUE, GMAIL_FETCH_MAILS). Priorité décroissante :
 * suppression > envoi > modification > création > lecture. */
const READ_INFIX = /(?:^|_)(GET|LIST|SEARCH|FIND|FETCH|SHOW|VIEW|READ|QUERY|RETRIEVE|OPEN)(?:_|$)/i
const CREATE_INFIX = /(?:^|_)(CREATE|ADD|NEW|INSERT|UPLOAD)(?:_|$)/i
const SEND_INFIX = /(?:^|_)(SEND|PUBLISH|POST|NOTIFY|BROADCAST|INVITE|SHARE|SUBMIT)(?:_|$)/i
const UPDATE_INFIX = /(?:^|_)(UPDATE|PATCH|EDIT|MERGE|MODIFY|RENAME|MOVE|SET|APPLY|ASSIGN|CLOSE|CANCEL|ARCHIVE|SCHEDULE|TRANSFER|REVOKE)(?:_|$)/i
const DELETE_INFIX = /(?:^|_)(DELETE|REMOVE|DESTROY|DROP|PURGE|TERMINATE|KILL|WIPE|RESET)(?:_|$)/i

/** Mots-clés de visibilité externe (le monde voit le résultat). */
const EXTERNAL_KEYWORD = /(SEND|PUBLISH|POST|TWEET|MESSAGE|EMAIL|MAIL|NOTIF|ANNOUNCE|BROADCAST|COMMENT|REPLY)/i
/** Mots-clés d'irréversibilité. */
const IRREVERSIBLE_KEYWORD = /(DELETE|REMOVE|DESTROY|TERMINATE|MERGE|WIPE|PURGE|DROP|KILL|RESET|CANCEL|REVOKE)/i
/** Mots-clés de mouvement d'argent. */
const MONEY_KEYWORD = /(PAY|CHARGE|PAYMENT|INVOICE|TRANSFER|REFUND|WALLET|PAYOUT|SUBSCRIB)/i

/** Apps financières — mouvement d'argent possible (prudence renforcée). */
const FINANCE_SLUGS = new Set([
  "stripe", "paypal", "quickbooks", "xero", "square", "wise", "coinbase",
  "flutterwave", "paystack", "wave", "mercadopago", "razorpay", "plaid",
  "mobilemoney", "mollie", "sepa", "revolut", "shopify_payments",
])
const FINANCE_CATEGORY = /(FINANCE|PAYMENT|BANKING|ACCOUNTING|COMMERCE)/i

/** Apps dont l'impact est public par nature. */
const PUBLIC_SLUGS = new Set(["twitter", "x", "linkedin", "facebook", "reddit", "medium", "instagram", "youtube", "mastodon", "threads"])

// ─────────────────────────────────────────────────────────────
// Évaluation
// ─────────────────────────────────────────────────────────────

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

/** true si l'app est financière (slug, catégorie locale ou catalogue). */
function isFinanceApp(appSlug: string): boolean {
  if (FINANCE_SLUGS.has(appSlug)) return true
  const app = getApp(appSlug)
  if (app && FINANCE_CATEGORY.test(app.category)) return true
  const catalogApp = getCatalogApp(appSlug)
  return !!catalogApp && FINANCE_CATEGORY.test(catalogApp.category)
}

/**
 * Évalue le risque d'une action. Résolution :
 * 1. action LOCALE → base sur la méthode HTTP réelle ;
 * 2. outil du CATALOGUE → heuristique de slug (source explicite) ;
 * 3. sinon (outils Composio hébergés, actions dynamiques) → heuristique.
 */
export function assessConnectorRisk(
  appSlug: string,
  actionSlug: string,
  params?: Record<string, unknown>
): RiskAssessment {
  const reasons: string[] = []
  const lowerSlug = actionSlug.toLowerCase()

  const local = getAction(appSlug, actionSlug)
  let score: number
  let source: RiskAssessment["source"]

  if (local) {
    // Base sur la méthode HTTP réelle de l'action locale.
    source = "LOCAL_ACTION"
    const method = local.action.method
    if (method === "GET") {
      score = 10
      reasons.push(`lecture pure (HTTP ${method})`)
    } else if (method === "DELETE") {
      score = 85
      reasons.push(`suppression (HTTP ${method})`)
    } else if (method === "PUT" || method === "PATCH") {
      score = CREATE_INFIX.test(actionSlug) ? 45 : 55
      reasons.push(CREATE_INFIX.test(actionSlug) ? `création via HTTP ${method}` : `mutation via HTTP ${method}`)
    } else {
      // POST : création nommée vs mutation générique.
      if (CREATE_INFIX.test(actionSlug)) {
        score = 45
        reasons.push("création de ressource")
      } else {
        score = 55
        reasons.push("mutation générique (HTTP POST)")
      }
    }
  } else {
    // Heuristique de slug — outils Composio (majuscules) et catalogue.
    const catalogTool = getCatalogTools(appSlug).tools.find((t) => t.slug.toLowerCase() === lowerSlug)
    source = catalogTool ? "CATALOG_TOOL" : "SLUG_HEURISTIC"

    if (DELETE_INFIX.test(actionSlug)) {
      score = 85
      reasons.push("suppression (verbe de destruction)")
    } else if (SEND_INFIX.test(actionSlug)) {
      score = 55
      reasons.push("envoi/publication (verbe de diffusion)")
    } else if (UPDATE_INFIX.test(actionSlug)) {
      score = 60
      reasons.push("modification (verbe de mutation)")
    } else if (CREATE_INFIX.test(actionSlug)) {
      score = 45
      reasons.push("création (verbe de création)")
    } else if (READ_INFIX.test(actionSlug)) {
      score = 10
      reasons.push("lecture (verbe d'accès)")
    } else {
      // Sémantique inconnue : prudent (MEDIUM).
      score = 55
      reasons.push("sémantique inconnue — évaluation prudente")
    }
  }

  // ── Amplificateurs ──────────────────────────────────────────

  if (EXTERNAL_KEYWORD.test(actionSlug)) {
    score += 15
    reasons.push("visibilité externe (envoi, publication, message public)")
  }
  if (IRREVERSIBLE_KEYWORD.test(actionSlug)) {
    score += 10
    reasons.push("opérateur d'irréversibilité présent")
  }
  const isPureRead = score <= 10
  if (isFinanceApp(appSlug)) {
    score += 15
    reasons.push("application financière")
    // Le mouvement d'argent n'amplifie que les NON-lectures
    // (list_charges / get_balance restent des lectures).
    if (!isPureRead && MONEY_KEYWORD.test(actionSlug)) {
      score += 15
      reasons.push("mouvement d'argent possible")
    }
  }
  if (PUBLIC_SLUGS.has(appSlug)) {
    score += 5
    reasons.push("application à impact public")
  }

  // Diffusion massive : destinataires multiples explicites dans les params.
  if (params) {
    for (const key of ["to", "recipients", "channels", "emails", "users", "ids", "numbers"]) {
      const v = params[key]
      if (Array.isArray(v) && v.length > 10) {
        score += 10
        reasons.push(`diffusion massive (${v.length} destinataires dans « ${key} »)`)
        break
      }
    }
    // Montant explicite sur une app financière.
    if (isFinanceApp(appSlug)) {
      for (const key of ["amount", "price", "total", "value"]) {
        const v = params[key]
        if (typeof v === "number" && v > 0) {
          score += 10
          reasons.push(`montant explicite (${v} ${key})`)
          break
        }
      }
    }
  }

  score = clampScore(score)
  const level = riskLevelFromScore(score)
  return { level, score, reasons, source }
}

/** Évalue le risque depuis une clé d'outil connector_\<app\>_\<action\>. */
export function assessToolKeyRisk(toolKey: string, params?: Record<string, unknown>): RiskAssessment {
  // Import tardif pour éviter un cycle de dépendance avec core/types.
  // parseConnectorToolKey est pur (aucun effet de bord).
  const parsed = parseKey(toolKey)
  if (!parsed) {
    // Clé non-connector : inconnu = prudent.
    return { level: "MEDIUM", score: 55, reasons: ["clé d'outil non connector"], source: "SLUG_HEURISTIC" }
  }
  return assessConnectorRisk(parsed.appSlug, parsed.actionSlug, params)
}

/** Parse local (évite le cycle d'import avec core/types). */
function parseKey(toolKey: string): { appSlug: string; actionSlug: string } | null {
  if (!toolKey.startsWith("connector_")) return null
  const rest = toolKey.slice("connector_".length)
  const idx = rest.indexOf("_")
  if (idx <= 0) return null
  return { appSlug: rest.slice(0, idx), actionSlug: rest.slice(idx + 1) }
}

/**
 * Les niveaux au-delà de ce seuil exigent une confirmation humaine
 * (HITL) au niveau du PLAN — utilisé par l'orchestrateur.
 */
export const PLAN_CONFIRMATION_RISK: RiskLevel[] = ["HIGH", "CRITICAL"]

/** Un requiredTools de plan contient-il une action HIGH/CRITICAL ? */
export function isPlanRiskyTool(toolKey: string): boolean {
  const risk = assessToolKeyRisk(toolKey)
  return PLAN_CONFIRMATION_RISK.includes(risk.level)
}
