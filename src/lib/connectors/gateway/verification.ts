/**
 * Result Verification — vérifie qu'une action a réellement produit son
 * effet (ADR-0017). Deux stratégies :
 *
 * 1. SHAPE (toujours) : transport 2xx, absence d'erreur applicative,
 *    présence d'une charge utile pour les créations, extraction des
 *    identifiants de preuve (id, number, key, url…).
 * 2. READBACK (pairs curatées) : relit la ressource créée via l'action
 *    GET jumelle (ex: github.create_issue → github.get_issue) et
 *    confirme qu'elle existe côté application — « vérifier les
 *    créations » du flux Agent → App → Verification → Result.
 *
 * L'exécuteur de read-back est INJECTÉ par le gateway (aucun cycle
 * d'import avec core/toolset). Le read-back n'est tenté que sur le
 * chemin local (connexions Composio hébergées : paramètres différents,
 * vérification shape seule).
 */

import { getAction } from "../apps"
import type { ActionExecutionResponse } from "../core/types"
import type { VerificationCheck, VerificationReport } from "./types"

// ─────────────────────────────────────────────────────────────
// Paires de vérification read-back (actions locales réelles)
// ─────────────────────────────────────────────────────────────

export interface ReadbackPair {
  appSlug: string
  actionSlug: string
  verifyActionSlug: string
  /** Construit les paramètres de lecture depuis la réponse + les params d'origine. */
  mapParams: (data: Record<string, unknown>, original: Record<string, unknown>) => Record<string, unknown> | null
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const READBACK_PAIRS: ReadbackPair[] = [
  {
    appSlug: "github",
    actionSlug: "create_issue",
    verifyActionSlug: "get_issue",
    mapParams: (data, original) => {
      const number = data.number
      if (typeof number !== "number" && typeof number !== "string") return null
      const owner = typeof original.owner === "string" ? original.owner : asRecord(data.base_repo)?.owner
      const repo = typeof original.repo === "string" ? original.repo : asRecord(data.repository)?.name
      if (!owner || !repo) return null
      return { owner, repo, issue_number: number }
    },
  },
  {
    appSlug: "github",
    actionSlug: "create_repository",
    verifyActionSlug: "get_repository",
    mapParams: (data) => {
      const owner = asRecord(data.owner)?.login
      const repo = data.name
      if (typeof owner !== "string" || typeof repo !== "string") return null
      return { owner, repo }
    },
  },
  {
    appSlug: "trello",
    actionSlug: "create_card",
    verifyActionSlug: "get_card",
    mapParams: (data) => (typeof data.id === "string" ? { card_id: data.id } : null),
  },
  {
    appSlug: "jira",
    actionSlug: "create_issue",
    verifyActionSlug: "get_issue",
    mapParams: (data) => (typeof data.key === "string" ? { issueKey: data.key } : null),
  },
  {
    appSlug: "notion",
    actionSlug: "create_page",
    verifyActionSlug: "get_page",
    mapParams: (data) => (typeof data.id === "string" ? { page_id: data.id } : null),
  },
]

/** Paire de read-back applicable à cette action (null si aucune). */
export function readbackPairFor(appSlug: string, actionSlug: string): ReadbackPair | null {
  return (
    READBACK_PAIRS.find((p) => p.appSlug === appSlug.toLowerCase() && p.actionSlug === actionSlug.toLowerCase()) ?? null
  )
}

// ─────────────────────────────────────────────────────────────
// Extraction de preuves
// ─────────────────────────────────────────────────────────────

const EVIDENCE_KEYS = ["id", "number", "key", "issue_number", "page_id", "card_id", "url", "html_url", "short_link", "token"]

function extractEvidence(data: unknown): string[] {
  const rec = asRecord(data)
  if (!rec) return []
  const found: string[] = []
  for (const k of EVIDENCE_KEYS) {
    const v = rec[k] ?? asRecord(rec.data)?.[k]
    if (typeof v === "string" && v.length > 0 && v.length <= 512) found.push(`${k}=${v}`)
    else if (typeof v === "number") found.push(`${k}=${v}`)
  }
  return found.slice(0, 6)
}

// ─────────────────────────────────────────────────────────────
// Vérification
// ─────────────────────────────────────────────────────────────

export interface VerifyOptions {
  /** Exécuteur de read-back injecté par le gateway (chemin local uniquement). */
  executeReadback?: (appSlug: string, actionSlug: string, params: Record<string, unknown>) => Promise<ActionExecutionResponse>
  /** false pour désactiver le read-back (config/test). */
  allowReadback?: boolean
}

function buildReport(
  strategy: VerificationReport["strategy"],
  checks: VerificationCheck[],
  evidence: string[]
): VerificationReport {
  const applicable = checks.filter((c) => c.name !== "readback" || strategy === "readback")
  const passed = applicable.filter((c) => c.pass).length
  return {
    verified: applicable.length > 0 && passed === applicable.length,
    strategy,
    confidence: applicable.length === 0 ? 0 : Number((passed / applicable.length).toFixed(2)),
    checks,
    evidence,
  }
}

/**
 * Vérifie le résultat d'une action :
 * - échec de transport → rapport « skipped » (vérification impossible) ;
 * - succès → contrôles de forme (toujours) + read-back si paire applicable
 *   et exécuteur fourni.
 */
export async function verifyActionResult(
  appSlug: string,
  actionSlug: string,
  response: ActionExecutionResponse,
  originalParams: Record<string, unknown>,
  opts: VerifyOptions = {}
): Promise<VerificationReport> {
  const checks: VerificationCheck[] = []
  const evidence = extractEvidence(response.data)

  // 1. Transport — échec : la vérification ne peut pas aller plus loin.
  checks.push({
    name: "transport",
    pass: response.ok && response.status >= 200 && response.status < 300,
    detail: response.ok
      ? `HTTP ${response.status} en ${response.latencyMs} ms`
      : `échec HTTP ${response.status}${response.error ? ` — ${response.error.slice(0, 200)}` : ""}`,
  })
  if (!checks[0].pass) {
    return buildReport("skipped", checks, evidence)
  }

  // 2. Erreur applicative dans le corps (conventions Slack/Composio incluses
  //    dans la normalisation de l'executor — re-testé ici par défense).
  const noBodyError = !response.error
  checks.push({
    name: "no_error_field",
    pass: noBodyError,
    detail: noBodyError ? "aucune erreur applicative signalée" : `erreur applicative : ${String(response.error).slice(0, 200)}`,
  })

  // 3. Charge utile : une création/mutation DOIT renvoyer une données
  //    (id, enregistrement, statut) — une réponse vide est suspecte.
  const local = getAction(appSlug, actionSlug)
  const isMutation = local ? local.action.method !== "GET" : !/^(GET|LIST|SEARCH|FIND|FETCH|SHOW|VIEW|READ|QUERY|RETRIEVE)_/i.test(actionSlug)
  if (isMutation) {
    const hasPayload =
      response.data !== null &&
      response.data !== undefined &&
      (typeof response.data !== "object" || Object.keys(response.data as object).length > 0) &&
      !(typeof response.data === "string" && response.data.trim() === "")
    checks.push({
      name: "payload_present",
      pass: hasPayload,
      detail: hasPayload
        ? `charge utile présente${evidence.length ? ` (${evidence.slice(0, 3).join(", ")})` : ""}`
        : "réponse vide pour une action en écriture — effet de bord non confirmé",
    })
  }

  // 4. Read-back — relit la ressource créée via l'action GET jumelle.
  const pair = readbackPairFor(appSlug, actionSlug)
  const readbackPossible =
    opts.allowReadback !== false &&
    pair !== null &&
    typeof opts.executeReadback === "function" &&
    !(response.connectionId ?? "").startsWith("cpc_") && // chemin local seulement
    response.ok
  if (readbackPossible && pair && opts.executeReadback) {
    const rec = asRecord(response.data) ?? {}
    const readbackParams = pair.mapParams(rec, originalParams)
    if (!readbackParams) {
      checks.push({
        name: "readback",
        pass: false,
        detail: "impossible de construire les paramètres de relecture depuis la réponse",
      })
    } else {
      try {
        const readback = await opts.executeReadback(pair.appSlug, pair.verifyActionSlug, readbackParams)
        const readOk = readback.ok && readback.status >= 200 && readback.status < 300
        checks.push({
          name: "readback",
          pass: readOk,
          detail: readOk
            ? `relecture ${pair.verifyActionSlug} confirmée (HTTP ${readback.status})`
            : `relecture ${pair.verifyActionSlug} échouée (HTTP ${readback.status}${readback.error ? ` — ${readback.error.slice(0, 150)}` : ""})`,
        })
      } catch (err) {
        checks.push({
          name: "readback",
          pass: false,
          detail: `relecture en erreur : ${err instanceof Error ? err.message.slice(0, 150) : String(err)}`,
        })
      }
    }
  }

  return buildReport(readbackPossible ? "readback" : "shape", checks, evidence)
}
