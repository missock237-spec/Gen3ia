import { AppError } from "@/lib/errors"
import { bumpBreakerTrip } from "@/lib/observability/metrics"
import { logger } from "@/lib/observability/logger"

/**
 * Circuit Breaker + backoff exponentiel (amélioration « Limiter les Retries »).
 *
 * Rôle : éviter les boucles infinies de RETRY/SWITCH/REPLAN et la
 * consommation excessive de crédits :
 *  - chaque dépendance (outil, fournisseur LLM) possède un breaker
 *    identifié par une clé (ex: « tool:code_runner », « provider:zai ») ;
 *  - CLOSED → OPEN après `failureThreshold` échecs dans la fenêtre
 *    glissante ; OPEN → HALF_OPEN après `cooldownMs` ; une seule sonde
 *    en HALF_OPEN, succès = reset, échec = retour OPEN ;
 *  - un plafond GLOBAL de retries par tâche (totalRetries en base) borne
 *    toutes les stratégies d'auto-correction combinées.
 *
 * Backoff : exponentiel avec jitter complet (full jitter) pour éviter
 * le thundering herd : base 1 s, ×2 par tentative, plafond 15 s.
 */

export interface BreakerConfig {
  failureThreshold: number
  windowMs: number
  cooldownMs: number
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  failureThreshold: 5,
  windowMs: 120_000,
  cooldownMs: 30_000,
}

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN"

interface BreakerEntry {
  state: BreakerState
  failures: number[]
  openedAt: number
  lastError: string | null
  lastFailureAt: number | null
}

const g = globalThis as unknown as { gen3iaBreakers?: Map<string, BreakerEntry> }

function breakers(): Map<string, BreakerEntry> {
  if (!g.gen3iaBreakers) g.gen3iaBreakers = new Map()
  return g.gen3iaBreakers
}

export interface BreakerStatus {
  key: string
  state: BreakerState
  failures: number
  lastError: string | null
  openedAt: number | null
  /** Attente avant nouvelle tentative autorisée (ms), 0 si fermé. */
  retryInMs: number
}

export class CircuitBreaker {
  constructor(
    public readonly key: string,
    private readonly config: BreakerConfig = DEFAULT_BREAKER_CONFIG
  ) {}

  private entry(): BreakerEntry {
    let e = breakers().get(this.key)
    if (!e) {
      e = { state: "CLOSED", failures: [], openedAt: 0, lastError: null, lastFailureAt: null }
      breakers().set(this.key, e)
    }
    return e
  }

  status(): BreakerStatus {
    const e = this.entry()
    const now = Date.now()
    let state = e.state
    if (state === "OPEN" && now - e.openedAt >= this.config.cooldownMs) {
      state = "HALF_OPEN"
    }
    const retryInMs =
      state === "OPEN" ? Math.max(0, e.openedAt + this.config.cooldownMs - now) : 0
    return {
      key: this.key,
      state,
      failures: e.failures.length,
      lastError: e.lastError,
      openedAt: e.state === "OPEN" ? e.openedAt : null,
      retryInMs,
    }
  }

  /** True si l'appel est autorisé ; false si le circuit est ouvert. */
  canCall(): boolean {
    return this.status().state !== "OPEN"
  }

  /** Exige l'autorisation — lève RETRY_BUDGET_EXCEEDED si ouvert. */
  guard(): void {
    const status = this.status()
    if (status.state === "OPEN") {
      throw new AppError("RETRY_BUDGET_EXCEEDED", {
        message: `Circuit ouvert pour ${this.key} — nouvel essai dans ${Math.ceil(status.retryInMs / 1000)} s.`,
        context: { breaker: this.key, state: status.state, retryInMs: status.retryInMs },
      })
    }
  }

  recordSuccess(): void {
    const e = this.entry()
    e.state = "CLOSED"
    e.failures = []
    e.lastError = null
  }

  recordFailure(error?: string): void {
    const e = this.entry()
    const now = Date.now()
    e.lastError = error?.slice(0, 300) ?? null
    e.lastFailureAt = now
    e.failures.push(now)
    // Fenêtre glissante.
    e.failures = e.failures.filter((t) => now - t < this.config.windowMs)
    if (e.state === "HALF_OPEN" || e.failures.length >= this.config.failureThreshold) {
      if (e.state !== "OPEN") {
        bumpBreakerTrip()
        logger.warn("breaker: circuit ouvert", { breaker: this.key, failures: e.failures.length })
      }
      e.state = "OPEN"
      e.openedAt = now
    }
  }

  /** Exécute fn sous la protection du breaker. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.guard()
    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure(err instanceof Error ? err.message : String(err))
      throw err
    }
  }
}

const breakerCache = new Map<string, CircuitBreaker>()

/** Breaker nommé réutilisable (clé stable, ex: « tool:web_search »). */
export function getBreaker(key: string, config?: BreakerConfig): CircuitBreaker {
  let b = breakerCache.get(key)
  if (!b) {
    b = new CircuitBreaker(key, config ?? DEFAULT_BREAKER_CONFIG)
    breakerCache.set(key, b)
  }
  return b
}

export function snapshotBreakers(): BreakerStatus[] {
  return [...breakers().keys()].map((key) => getBreaker(key).status())
}

export function resetBreakers(): void {
  breakers().clear()
}

// ---------- Backoff exponentiel avec jitter ----------

export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
}

/** Attente recommandée avant la tentative n° `attempt` (1 = première erreur). */
export function backoffDelayMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 1000
  const max = opts.maxMs ?? 15_000
  const exp = Math.min(max, base * Math.pow(2, Math.max(1, attempt) - 1))
  // Jitter complet : uniforme dans [0, exp] — évite le thundering herd.
  return Math.round(Math.random() * exp)
}

/** Plafond global de retries par tâche (toutes stratégies confondues). */
export const MAX_TOTAL_RETRIES_PER_TASK = 8

export function totalRetryBudgetExceeded(totalRetries: number): boolean {
  return totalRetries >= MAX_TOTAL_RETRIES_PER_TASK
}
