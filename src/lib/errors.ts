/**
 * Catalogue centralisé des erreurs métier GEN3IA.
 *
 * Objectifs (amélioration « Centraliser la Gestion d'Erreurs ») :
 *  - un registre UNIQUE de codes d'erreur stables et testés ;
 *  - une hiérarchie AppError → erreurs de domaine, avec statut HTTP,
 *    message utilisateur (français) et rejouabilité ;
 *  - un mapping unique inconnu → INTERNAL_ERROR côté API.
 *
 * Les routes API consomment `AppError.toResponse()` ; les moteurs
 * lèvent des erreurs typées (ex: PLANNING_FAILED) qui remontent
 * jusqu'à l'orchestrateur avec leur contexte.
 */

export const ERROR_CODES = {
  // ----- Erreurs génériques -----
  VALIDATION_ERROR: { status: 400, message: "Données invalides.", retryable: false },
  BAD_JSON: { status: 400, message: "Corps de requête JSON invalide.", retryable: false },
  NOT_FOUND: { status: 404, message: "Ressource introuvable.", retryable: false },
  FORBIDDEN: { status: 403, message: "Accès refusé.", retryable: false },
  UNAUTHORIZED: { status: 401, message: "Authentification requise.", retryable: false },
  INTERNAL_ERROR: { status: 500, message: "Une erreur interne est survenue. Réessayez ou contactez le support.", retryable: true },
  RATE_LIMITED: { status: 429, message: "Limite de requêtes atteinte. Réessayez dans un instant.", retryable: true },

  // ----- Authentification / comptes -----
  BAD_CREDENTIALS: { status: 401, message: "Identifiants incorrects.", retryable: false },
  EMAIL_TAKEN: { status: 409, message: "Un compte existe déjà avec cet e-mail.", retryable: false },
  SESSION_EXPIRED: { status: 401, message: "Session expirée, reconnectez-vous.", retryable: false },
  BAD_API_KEY: { status: 401, message: "Clé API invalide ou révoquée.", retryable: false },

  // ----- Crédits / facturation -----
  INSUFFICIENT_CREDITS: { status: 402, message: "Crédits insuffisants pour cette opération. Rechargez votre compte.", retryable: false },
  PAYMENT_FAILED: { status: 402, message: "Le paiement n'a pas abouti.", retryable: true },
  WEBHOOK_INVALID: { status: 400, message: "Signature de webhook invalide.", retryable: false },

  // ----- Moteurs (pipeline) -----
  ANALYSIS_FAILED: { status: 500, message: "L'analyse de la demande a échoué.", retryable: true },
  PLANNING_FAILED: { status: 500, message: "La génération des plans a échoué.", retryable: true },
  EVALUATION_FAILED: { status: 500, message: "L'évaluation des plans a échoué.", retryable: false },
  EXECUTION_FAILED: { status: 500, message: "L'exécution du plan a échoué.", retryable: true },
  VERIFICATION_FAILED: { status: 500, message: "La vérification du résultat a échoué.", retryable: true },
  LEARNING_FAILED: { status: 500, message: "L'extraction des leçons a échoué (sans impact sur la tâche).", retryable: true },
  RETRY_BUDGET_EXCEEDED: { status: 500, message: "Budget global de tentatives épuisé (circuit breaker).", retryable: false },

  // ----- Agents / marketplace -----
  AGENT_NOT_FOUND: { status: 404, message: "Agent introuvable.", retryable: false },
  AGENT_REQUIRED: { status: 400, message: "Un agent doit être sélectionné.", retryable: false },
  AGENT_LIMIT: { status: 402, message: "Limite d'agents atteinte pour votre offre (5 en FREE).", retryable: false },
  AGENT_NOT_DEPLOYED: { status: 409, message: "Cet agent n'est pas déployé.", retryable: false },
  NO_SYSTEM_PROMPT: { status: 400, message: "Un prompt système est requis pour déployer un agent.", retryable: false },

  // ----- Sécurité / sandbox -----
  SANDBOX_VIOLATION: { status: 400, message: "Code refusé par la sandbox (motif interdit détecté).", retryable: false },
  SSRF_BLOCKED: { status: 400, message: "URL bloquée par la politique de sécurité réseau.", retryable: false },
  TASK_NOT_APPROVABLE: { status: 409, message: "Cette tâche n'est pas en attente d'approbation.", retryable: false },
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export interface AppErrorOptions {
  cause?: unknown
  context?: Record<string, unknown>
  /** Remplace le message par défaut du catalogue (message utilisateur). */
  message?: string
  /** Détail technique (journaux uniquement, jamais renvoyé au client). */
  detail?: string
}

/** Erreur applicative typée — source unique de vérité des réponses d'erreur API. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly userMessage: string
  readonly retryable: boolean
  readonly context: Record<string, unknown>
  readonly technicalDetail?: string

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const spec = ERROR_CODES[code]
    super(options.message ?? spec.message)
    this.name = `AppError[${code}]`
    this.code = code
    this.status = spec.status
    this.userMessage = options.message ?? spec.message
    this.retryable = spec.retryable
    this.context = options.context ?? {}
    this.technicalDetail = options.detail
    if (options.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }

  toJSON() {
    return { ok: false, error: this.userMessage, code: this.code }
  }

  toResponse(extra?: Record<string, unknown>) {
    return Response.json({ ok: false, error: this.userMessage, code: this.code, ...extra }, { status: this.status })
  }
}

/** Erreur métier des moteurs du pipeline (hérite du catalogue). */
export class EngineError extends AppError {
  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(code, { ...options, message })
    this.name = `EngineError[${code}]`
  }
}

/** Convertit n'importe quelle erreur inconnue en AppError (jamais de fuite de détail). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const detail = err instanceof Error ? err.message : String(err)
  return new AppError("INTERNAL_ERROR", { detail, cause: err })
}
