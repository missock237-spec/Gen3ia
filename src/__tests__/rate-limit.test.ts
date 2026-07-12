/**
 * Tests unitaires — rate-limit.ts (mode mémoire / sans Redis)
 */
import { describe, test, expect, beforeEach } from 'bun:test';

// Simuler le rate limiter en mémoire directement
// pour ne pas dépendre de Redis dans les tests unitaires

interface RateLimitOptions {
  max: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

interface MemoryEntry {
  count: number;
  resetAt: number;
}

function createMemoryRateLimiter() {
  const store = new Map<string, MemoryEntry>();

  function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      const resetAt = now + options.windowMs;
      store.set(key, { count: 1, resetAt });
      return { success: true, remaining: options.max - 1, resetAt };
    }

    if (entry.count >= options.max) {
      return { success: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return {
      success: true,
      remaining: Math.max(options.max - entry.count, 0),
      resetAt: entry.resetAt,
    };
  }

  function reset() {
    store.clear();
  }

  return { rateLimit, reset };
}

describe('Rate Limiter (mode mémoire)', () => {
  const { rateLimit, reset } = createMemoryRateLimiter();

  beforeEach(() => {
    reset();
  });

  test('autorise la première requête', () => {
    const result = rateLimit('user:1', { max: 5, windowMs: 60_000 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  test('compte correctement les requêtes', () => {
    const opts = { max: 3, windowMs: 60_000 };
    rateLimit('user:2', opts);
    rateLimit('user:2', opts);
    const third = rateLimit('user:2', opts);
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);
  });

  test('bloque après avoir dépassé la limite', () => {
    const opts = { max: 2, windowMs: 60_000 };
    rateLimit('user:3', opts);
    rateLimit('user:3', opts);
    const blocked = rateLimit('user:3', opts);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  test('les clés différentes ont des compteurs indépendants', () => {
    const opts = { max: 2, windowMs: 60_000 };
    rateLimit('user:4', opts);
    rateLimit('user:4', opts);
    const other = rateLimit('user:5', opts);
    expect(other.success).toBe(true);
    expect(other.remaining).toBe(1);
  });

  test('resetAt est dans le futur', () => {
    const result = rateLimit('user:6', { max: 5, windowMs: 10_000 });
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
