// ============================================================
// Gen3ia — Circuit Breaker (Phase 4.1 · Résilience)
// Protège les dépendances externes (Redis, fournisseurs IA, Stripe,
// bases de données) contre les cascades de failures.
// ============================================================

import { createLogger } from './logger';

const log = createLogger('circuit-breaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  // Nombre d'échecs consécutifs avant d'ouvrir le circuit
  failureThreshold?: number;
  // Durée (ms) pendant laquelle le circuit reste ouvert avant HALF_OPEN
  cooldownMs?: number;
  // Nombre maximal de tentatives d'essai pendant l'état HALF_OPEN
  halfOpenMaxTrials?: number;
  // Ratio de succès requis (0..1) pour refermer le circuit
  successThreshold?: number;
}

interface CircuitBreakerState {
  failures: number;
  consecutiveSuccesses: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  totalCalls: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxTrials: number;
  private readonly successThreshold: number;
  private s: CircuitBreakerState = {
    failures: 0,
    consecutiveSuccesses: 0,
    openedAt: null,
    lastFailureAt: null,
    totalCalls: 0,
    totalFailures: 0,
  };

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.halfOpenMaxTrials = options.halfOpenMaxTrials ?? 1;
    this.successThreshold = options.successThreshold ?? 0.5;
  }

  get currentState(): CircuitState {
    // Transition automatique OPEN -> HALF_OPEN après le cooldown
    if (this.state === 'OPEN' && this.s.openedAt !== null) {
      if (Date.now() - this.s.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        log.info('circuit_half_open', { name: this.name });
      }
    }
    return this.state;
  }

  /** Permet d'exécuter fn si le circuit est fermé/half-open, sinon lève CircuitOpenError. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.currentState;
    if (current === 'OPEN') {
      throw new CircuitOpenError(this.name);
    }

    // En HALF_OPEN, on limite le nombre de tentatives d'essai simultanées
    if (current === 'HALF_OPEN' && this.s.consecutiveSuccesses >= this.halfOpenMaxTrials) {
      throw new CircuitOpenError(this.name);
    }

    this.s.totalCalls += 1;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess(): void {
    this.s.consecutiveSuccesses += 1;
    this.s.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.s.openedAt = null;
      log.info('circuit_closed', { name: this.name, consecutiveSuccesses: this.s.consecutiveSuccesses });
    }
  }

  onFailure(): void {
    this.s.failures += 1;
    this.s.totalFailures += 1;
    this.s.consecutiveSuccesses = 0;
    this.s.lastFailureAt = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Un échec en HALF_OPEN rouvre immédiatement le circuit
      this.open();
      return;
    }

    if (this.s.failures >= this.failureThreshold) {
      this.open();
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.s = {
      failures: 0,
      consecutiveSuccesses: 0,
      openedAt: null,
      lastFailureAt: null,
      totalCalls: 0,
      totalFailures: 0,
    };
  }

  getStats() {
    return {
      name: this.name,
      state: this.currentState,
      totalCalls: this.s.totalCalls,
      totalFailures: this.s.totalFailures,
      totalSuccesses: this.s.totalCalls - this.s.totalFailures,
      lastFailureAt: this.s.lastFailureAt,
    };
  }

  private open(): void {
    this.state = 'OPEN';
    this.s.openedAt = Date.now();
    log.error('circuit_opened', {
      name: this.name,
      failures: this.s.failures,
      failureThreshold: this.failureThreshold,
    });
  }
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' est OUVRiT — service temporairement indisponible.`);
    this.name = 'CircuitOpenError';
  }
}

// Registre global des breakers pour monitoring
const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  let breaker = registry.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, options);
    registry.set(name, breaker);
  }
  return breaker;
}

export function getRegistryStats(): ReturnType<CircuitBreaker['getStats']>[] {
  return Array.from(registry.values()).map((b) => b.getStats());
}
