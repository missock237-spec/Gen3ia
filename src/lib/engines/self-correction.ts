import type { CorrectionLogEntry, CorrectionStrategy, ErrorClass } from "./types"
import { LLMError } from "@/lib/ai/types"
import { StructuredOutputError } from "@/lib/ai/structured"
import { InsufficientCreditsError } from "@/lib/credits/ledger"

/**
 * Self-Correction Engine — détecte, classe, attribue et corrige les erreurs.
 * Stratégies : RETRY (même tentative), SWITCH_MODEL (fournisseur de repli),
 * SWITCH_TOOL (outil alternatif), REPLAN (nouveau plan), ABORT (arrêt propre).
 * Règle d'or : ne JAMAIS déclarer une tâche réussie sans preuve.
 */

export interface ErrorAnalysis {
  classification: ErrorClass
  attribution: string
  strategy: CorrectionStrategy
  reason: string
}

export function analyzeError(err: unknown): ErrorAnalysis {
  if (err instanceof InsufficientCreditsError) {
    return {
      classification: "CONTEXT",
      attribution: "Crédits utilisateur insuffisants — le solde ne couvre pas l'exécution.",
      strategy: "ABORT",
      reason: err.message,
    }
  }
  if (err instanceof LLMError) {
    if (err.code === "ALL_PROVIDERS_FAILED") {
      return {
        classification: "MODEL",
        attribution: "Infrastructures de modèle indisponibles ou mal configurées.",
        strategy: "ABORT",
        reason: err.message,
      }
    }
    if (err.code === "ZAI_INIT_FAILED" || err.code === "MISSING_KEY") {
      return {
        classification: "MODEL",
        attribution: "Fournisseur non configuré.",
        strategy: "SWITCH_MODEL",
        reason: err.message,
      }
    }
    if (err.code === "HTTP_429") {
      return {
        classification: "TRANSIENT",
        attribution: "Limite de débit atteinte chez le fournisseur.",
        strategy: "SWITCH_MODEL",
        reason: err.message,
      }
    }
    if (err.code === "NETWORK_ERROR" || err.code?.startsWith("HTTP_5")) {
      return {
        classification: "TRANSIENT",
        attribution: "Erreur transitoire du fournisseur.",
        strategy: "RETRY",
        reason: err.message,
      }
    }
    return {
      classification: "MODEL",
      attribution: "Erreur du fournisseur de modèle.",
      strategy: "SWITCH_MODEL",
      reason: err.message,
    }
  }
  if (err instanceof StructuredOutputError) {
    return {
      classification: "OUTPUT_FORMAT",
      attribution: "Le modèle n'a pas respecté le format JSON attendu.",
      strategy: "SWITCH_MODEL",
      reason: err.message,
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/outil|tool|TOOL/i.test(message)) {
    return {
      classification: "TOOL",
      attribution: "Échec d'un outil pendant l'exécution.",
      strategy: "RETRY",
      reason: message,
    }
  }
  if (/JSON|schéma|schema|validation|conforme/i.test(message)) {
    return {
      classification: "OUTPUT_FORMAT",
      attribution: "Format de sortie invalide.",
      strategy: "RETRY",
      reason: message,
    }
  }
  return {
    classification: "LOGIC",
    attribution: "Erreur logique ou de contexte pendant l'exécution.",
    strategy: "RETRY",
    reason: message,
  }
}

/** Signal interne : le replan doit être géré par l'orchestrateur. */
export class ReplanRequiredError extends Error {
  reason: string

  constructor(reason: string) {
    super(`Replanification requise : ${reason}`)
    this.reason = reason
  }
}

export interface SelfCorrectionOptions<T> {
  phase: string
  maxAttempts: number
  attempt: number // tentatives déjà consommées
  onCorrection?: (entry: CorrectionLogEntry) => Promise<void> | void
  providerOverride?: string
}

export interface SelfCorrectionResult<T> {
  value: T
  attempts: number
  corrections: CorrectionLogEntry[]
  providerOverride?: string
}

/**
 * Exécute une opération avec auto-correction intégrée.
 * Chaque échec est classé, journalisé, puis la stratégie adaptée est appliquée.
 */
export async function runWithSelfCorrection<T>(
  fn: (ctx: { attempt: number; providerOverride?: string; previousError?: string }) => Promise<T>,
  opts: SelfCorrectionOptions<T>
): Promise<SelfCorrectionResult<T>> {
  const corrections: CorrectionLogEntry[] = []
  let attempt = opts.attempt
  let providerOverride = opts.providerOverride
  let lastError: unknown

  while (attempt < opts.maxAttempts + opts.attempt) {
    try {
      const value = await fn({
        attempt,
        providerOverride,
        previousError: lastError instanceof Error ? lastError.message : undefined,
      })
      return { value, attempts: attempt - opts.attempt + 1, corrections, providerOverride }
    } catch (err) {
      lastError = err
      const analysis = analyzeError(err)
      const entry: CorrectionLogEntry = {
        attempt,
        phase: opts.phase,
        error: analysis.reason.slice(0, 500),
        classification: analysis.classification,
        attribution: analysis.attribution,
        strategy: analysis.strategy,
        action: describeAction(analysis.strategy, providerOverride),
        outcome: "ESCALATED",
      }

      if (analysis.strategy === "ABORT") {
        entry.outcome = "ABORTED"
        corrections.push(entry)
        await opts.onCorrection?.(entry)
        throw err
      }
      if (analysis.strategy === "SWITCH_MODEL") {
        providerOverride = undefined // retour au routage automatique (fournisseur suivant)
        entry.action = "Bascule vers le fournisseur de repli via le Model Router."
      }
      if (analysis.strategy === "RETRY") {
        entry.action = `Nouvelle tentative (${attempt + 1}) avec le même contexte.`
      }
      if (analysis.strategy === "SWITCH_TOOL") {
        entry.action = "Outil alternatif ou approche sans l'outil défaillant."
      }
      if (analysis.strategy === "REPLAN") {
        entry.outcome = "ESCALATED"
        corrections.push(entry)
        await opts.onCorrection?.(entry)
        throw new ReplanRequiredError(analysis.reason)
      }

      corrections.push(entry)
      await opts.onCorrection?.(entry)
      attempt++
      if (attempt >= opts.maxAttempts + opts.attempt) {
        // Dernière tentative : si elle échoue encore, on escalade au replan.
        if (opts.phase === "EXECUTING") {
          throw new ReplanRequiredError(
            `Échecs répétés en exécution (${opts.attempt} tentatives) : ${analysis.reason}`
          )
        }
        throw err
      }
      // Temporisation : laisse respirer les fournisseurs saturés (429/5xx).
      if (analysis.classification === "TRANSIENT") {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Échec après auto-correction.")
}

function describeAction(strategy: CorrectionStrategy, providerOverride?: string): string {
  switch (strategy) {
    case "RETRY":
      return "Nouvelle tentative immédiate."
    case "SWITCH_MODEL":
      return providerOverride
        ? `Abandon du fournisseur ${providerOverride}, routage automatique de repli.`
        : "Routage automatique vers un fournisseur de repli."
    case "SWITCH_TOOL":
      return "Utilisation d'un outil alternatif."
    case "REPLAN":
      return "Génération d'un nouveau plan excluant l'approche défaillante."
    default:
      return "Arrêt propre de la tâche avec rapport d'erreur."
  }
}
