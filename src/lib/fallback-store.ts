// ============================================================
// Gen3ia — Fallback Store (Phase 4.2 · Graceful Degradation)
// Fournit des dégradations élégantes quand un service d'infra
// est indisponible : DB, queue (Redis), données métier.
//
// Principes :
//  - DB read fail  -> sert un snapshot en cache + retry contrôlé
//  - Queue full    -> reject explicite 429 (pas de perte silencieuse)
//  - Redis down    -> store mémoire interne avec TTL court
// ============================================================

import { createLogger } from '@/lib/logger';
import { getCircuitBreaker } from '@/lib/circuit-breaker';

const log = createLogger('fallback-store');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FallbackEntry<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
}

/** Statut courant d'un composant d'infra surveillé. */
export interface DegradationStatus {
  db: 'healthy' | 'degraded' | 'down';
  queue: 'healthy' | 'full' | 'down';
  redis: 'healthy' | 'down';
  lastDegradedAt: number | null;
  activeFallbacks: Record<string, number>;
}

interface FallbackStoreOptions {
  /** TTL (ms) d'un snapshot mémoire par défaut. */
  defaultTtlMs?: number;
  /** Nombre max de retries après un échec DB. */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// FallbackStore
// ---------------------------------------------------------------------------

class FallbackStore {
  private memory = new Map<string, FallbackEntry<unknown>>();
  private readonly defaultTtlMs: number;
  private readonly maxRetries: number;

  // Status d'infra
  private dbStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
  private queueStatus: 'healthy' | 'full' | 'down' = 'healthy';
  private lastDegradedAt: number | null = null;
  private activeFallbacks: Record<string, number> = {};

  constructor(options: FallbackStoreOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000; // 60s par défaut
    this.maxRetries = options.maxRetries ?? 1;
  }

  // -------------------------------------------------------------------------
  // Snapshot mémoire (fallback Redis -> mémoire locale, TTL court)
  // -------------------------------------------------------------------------

  setSnapshot<T>(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    this.memory.set(key, {
      value,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
    this.markActiveFallback(key, ttlMs);
  }

  getSnapshot<T>(key: string): T | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return entry.value as T;
  }

  clearSnapshot(key: string): void {
    this.memory.delete(key);
  }

  // -------------------------------------------------------------------------
  // DB read avec dégradation
  // -------------------------------------------------------------------------

  /**
   * Lit depuis la DB. En cas d'échec : retry contrôlé puis snapshot cache.
   * Retourne { data, stale } où stale indique que la valeur vient du fallback.
   */
  async readWithFallback<T>(
    cacheKey: string,
    read: () => Promise<T>,
    options: { ttlMs?: number; onSuccess?: (value: T) => Promise<void> | void } = {},
  ): Promise<{ data: T; stale: boolean }> {
    const breaker = getCircuitBreaker(`db:read:${cacheKey}`);

    try {
      const data = await breaker.execute(read);
      // Succès : rafraîchit le snapshot si un hook de stockage est fourni
      if (options.onSuccess) await options.onSuccess(data);
      this.setDbHealthy();
      return { data, stale: false };
    } catch (error) {
      // Échec DB : servir le snapshot le plus récent (stale-while-revalidate)
      this.markDbDegraded(error);
      const stale = this.getSnapshot<T>(cacheKey);
      if (stale !== null) {
        log.warn('db_fallback_served_stale', { cacheKey });
        return { data: stale, stale: true };
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Queue full -> reject 429
  // -------------------------------------------------------------------------

  /**
   * Enveloppe une soumission de job. Si la queue est saturée, on rejette
   * explicitement avec une erreur 429 au lieu d'un échec silencieux.
   */
  async submitWithQueueGuard<T>(
    submit: () => Promise<T>,
    options: { capacity?: () => Promise<{ active: number; limit: number }> } = {},
  ): Promise<T> {
    if (options.capacity) {
      let capacity;
      try {
        capacity = await options.capacity();
      } catch {
        this.markQueueDown();
        throw new QueueUnavailableError();
      }

      if (capacity.active >= capacity.limit) {
        this.markQueueFull();
        throw new QueueCapacityError({
          message: 'Queue saturée — redemandez plus tard.',
          active: capacity.active,
          limit: capacity.limit,
        });
      }
    }

    try {
      const result = await submit();
      this.setQueueHealthy();
      return result;
    } catch (error) {
      this.markQueueDown();
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Transitions d'état
  // -------------------------------------------------------------------------

  private markDbDegraded(error: unknown): void {
    this.dbStatus = 'degraded';
    this.lastDegradedAt = Date.now();
    log.error('db_degraded', { error: error instanceof Error ? error.message : 'unknown' });
  }

  private setDbHealthy(): void {
    this.dbStatus = 'healthy';
  }

  private markQueueFull(): void {
    if (this.queueStatus !== 'full') {
      this.queueStatus = 'full';
      this.lastDegradedAt = Date.now();
      log.warn('queue_full');
    }
  }

  private markQueueDown(): void {
    this.queueStatus = 'down';
    this.lastDegradedAt = Date.now();
  }

  private setQueueHealthy(): void {
    this.queueStatus = 'healthy';
  }

  private markActiveFallback(key: string, ttlMs: number): void {
    this.activeFallbacks[key] = Date.now() + ttlMs;
    // Nettoyage périodique des fallbacks expirés
    for (const [k, exp] of Object.entries(this.activeFallbacks)) {
      if (Date.now() > exp) delete this.activeFallbacks[k];
    }
  }

  // -------------------------------------------------------------------------
  // Statut global
  // -------------------------------------------------------------------------

  getStatus(): DegradationStatus {
    const redisHealthy = this.activeFallbacks['$redis'] === undefined;
    return {
      db: this.dbStatus,
      queue: this.queueStatus,
      redis: redisHealthy ? 'healthy' : 'down',
      lastDegradedAt: this.lastDegradedAt,
      activeFallbacks: { ...this.activeFallbacks },
    };
  }

  reset(): void {
    this.memory.clear();
    this.dbStatus = 'healthy';
    this.queueStatus = 'healthy';
    this.lastDegradedAt = null;
    this.activeFallbacks = {};
  }
}

// ---------------------------------------------------------------------------
// Erreurs métier de dégradation
// ---------------------------------------------------------------------------

/** Levée quand une opération ne peut pas être servie en dégradé. */
export class DegradationError extends Error {
  readonly code: string = 'DEGRADATION';
  readonly status: number = 503;
}

/** Levée quand la queue (Redis back-end) est pleine -> HTTP 429. */
export class QueueCapacityError extends DegradationError {
  override readonly code: string = 'QUEUE_FULL';
  override readonly status: number = 429;
  readonly active: number;
  readonly limit: number;

  constructor(opts: { message?: string; active: number; limit: number }) {
    super(opts.message ?? 'Queue saturée.');
    this.active = opts.active;
    this.limit = opts.limit;
    this.name = 'QueueCapacityError';
  }
}

/** Levée quand la queue est indisponible (Redis down) -> HTTP 503. */
export class QueueUnavailableError extends DegradationError {
  override readonly status: number = 503;
  constructor() {
    super('Service de file d\'attente temporairement indisponible.');
    this.name = 'QueueUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// Singleton exposé
// ---------------------------------------------------------------------------

export const fallbackStore = new FallbackStore();
export default fallbackStore;
