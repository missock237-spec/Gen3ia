// ============================================================
// RATE LIMITER — Upstash Redis / Fallback mémoire
// ============================================================
// Utilise Upstash Redis (edge) quand disponible, sinon mémoire locale
// Stratégies différenciées par endpoint
// ============================================================

import { logger } from "./logger";

type RateLimitStrategy = {
  windowMs: number;
  maxRequests: number;
};

const RATE_LIMIT_STRATEGIES: Record<string, RateLimitStrategy> = {
  strict:   { windowMs: 60_000,  maxRequests: 10 },
  moderate: { windowMs: 60_000,  maxRequests: 60 },
  relaxed:  { windowMs: 60_000,  maxRequests: 200 },
};

export function getStrategy(pathname: string): RateLimitStrategy {
  if (pathname.startsWith("/api/auth/"))     return RATE_LIMIT_STRATEGIES.strict;
  if (pathname.startsWith("/api/agents"))    return RATE_LIMIT_STRATEGIES.moderate;
  if (pathname.startsWith("/api/workflows")) return RATE_LIMIT_STRATEGIES.moderate;
  if (pathname.startsWith("/api/webhooks"))  return RATE_LIMIT_STRATEGIES.relaxed;
  if (pathname.startsWith("/api/payments"))  return RATE_LIMIT_STRATEGIES.strict;
  return RATE_LIMIT_STRATEGIES.moderate;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

class RateLimiter {
  private fallbackStore = new Map<string, number[]>();

  async check(identifier: string, pathname: string): Promise<RateLimitResult> {
    const strategy = getStrategy(pathname);

    // Tentative Upstash Redis
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        return await this.checkWithUpstash(identifier, pathname, strategy);
      } catch (error) {
        logger.warn("rate_limiter_upstash_fallback", { error: String(error) });
        // Fallback mémoire
      }
    }

    return this.checkWithMemory(identifier, pathname, strategy);
  }

  private async checkWithUpstash(
    identifier: string,
    pathname: string,
    strategy: RateLimitStrategy,
  ): Promise<RateLimitResult> {
    const key = `ratelimit:${pathname}:${identifier}`;
    const now = Date.now();
    const windowStart = now - strategy.windowMs;

    const response = await fetch(
      `${process.env.UPSTASH_REDIS_REST_URL}/zremrangebyscore/${key}/${windowStart}/${now}/zcard/${key}/expire/${key}/${Math.ceil(strategy.windowMs / 1000)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Upstash error: ${response.status}`);
    }

    const data = await response.json();
    const count = Array.isArray(data) ? (data[1] as number) ?? 0 : 0;

    if (count >= strategy.maxRequests) {
      return { allowed: false, remaining: 0, resetIn: Math.ceil(strategy.windowMs / 1000) };
    }

    // Ajouter la requête courante
    await fetch(
      `${process.env.UPSTASH_REDIS_REST_URL}/zadd/${key}/${now}/${now}`,
      {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      },
    );

    return { allowed: true, remaining: strategy.maxRequests - count - 1, resetIn: Math.ceil(strategy.windowMs / 1000) };
  }

  private checkWithMemory(
    identifier: string,
    pathname: string,
    strategy: RateLimitStrategy,
  ): RateLimitResult {
    const key = `${identifier}:${pathname}`;
    const now = Date.now();

    let timestamps = this.fallbackStore.get(key) ?? [];
    timestamps = timestamps.filter((t) => now - t < strategy.windowMs);

    if (timestamps.length >= strategy.maxRequests) {
      const oldest = timestamps[0] as number;
      const resetIn = Math.ceil((oldest + strategy.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, resetIn: Math.max(1, resetIn) };
    }

    timestamps.push(now);
    this.fallbackStore.set(key, timestamps);
    return { allowed: true, remaining: strategy.maxRequests - timestamps.length, resetIn: Math.ceil(strategy.windowMs / 1000) };
  }
}

export const rateLimiter = new RateLimiter();