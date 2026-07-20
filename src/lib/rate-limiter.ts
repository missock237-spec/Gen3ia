// ============================================================
// RATE LIMITER — Distribué (Upstash) + Fallback mémoire
// ============================================================
// Stratégies granulaires par endpoint avec scoring.
// Les endpoints sensibles (auth) sont 10x plus restrictifs
// que les lectures simples.
// ============================================================

import { logger } from "./logger";

export type EndpointCategory =
  | "auth"          // Login, register, forgot-password
  | "agent_execute"  // Exécution d'agent (coûteux)
  | "agent_crud"    // CRUD agents
  | "workflow"      // Workflows
  | "payment"       // Paiements SebPay
  | "webhook"       // Webhooks entrants
  | "read"          // Lectures simples
  | "admin"         // Routes admin
  | "default";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstMax?: number;      // Burst court terme
  burstWindowMs?: number;  // Fenêtre burst
  cost?: number;          // Coût en "points" de la requête
}

const RATE_LIMIT_CONFIGS: Record<EndpointCategory, RateLimitConfig> = {
  auth:           { windowMs: 60_000,  maxRequests: 10,   burstMax: 3,    burstWindowMs: 10_000, cost: 5 },
  agent_execute:  { windowMs: 60_000,  maxRequests: 20,   burstMax: 5,    burstWindowMs: 10_000, cost: 3 },
  agent_crud:     { windowMs: 60_000,  maxRequests: 60,   burstMax: 10,   burstWindowMs: 10_000, cost: 1 },
  workflow:       { windowMs: 60_000,  maxRequests: 30,   burstMax: 5,    burstWindowMs: 10_000, cost: 2 },
  payment:        { windowMs: 60_000,  maxRequests: 10,   burstMax: 2,    burstWindowMs: 30_000, cost: 5 },
  webhook:        { windowMs: 60_000,  maxRequests: 200,  burstMax: 50,   burstWindowMs: 5_000,  cost: 1 },
  read:           { windowMs: 60_000,  maxRequests: 200,  burstMax: 30,   burstWindowMs: 5_000,  cost: 1 },
  admin:          { windowMs: 60_000,  maxRequests: 100,  burstMax: 20,   burstWindowMs: 10_000, cost: 1 },
  default:        { windowMs: 60_000,  maxRequests: 60,   burstMax: 10,   burstWindowMs: 10_000, cost: 1 },
};

export function getCategory(pathname: string): EndpointCategory {
  if (pathname.startsWith("/api/auth/"))     return "auth";
  if (pathname.startsWith("/api/agents/run")) return "agent_execute";
  if (pathname.startsWith("/api/agents"))    return "agent_crud";
  if (pathname.startsWith("/api/workflows")) return "workflow";
  if (pathname.startsWith("/api/payments"))  return "payment";
  if (pathname.startsWith("/api/webhooks"))  return "webhook";
  if (pathname.startsWith("/api/admin"))     return "admin";
  if (pathname.startsWith("/api/health") || pathname.startsWith("/api/metrics") || pathname.startsWith("/api/plans")) return "read";
  return "default";
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  category: EndpointCategory;
  limit: number;
}

class RateLimiter {
  private fallbackStore = new Map<string, { timestamps: number[]; score: number }>();

  async check(identifier: string, pathname: string): Promise<RateLimitResult> {
    const category = getCategory(pathname);
    const config = RATE_LIMIT_CONFIGS[category];

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        return await this.checkWithUpstash(identifier, category, config);
      } catch (error) {
        logger.warn("rate_limiter_upstash_fallback", { error: String(error), category });
      }
    }

    return this.checkWithMemory(identifier, category, config);
  }

  private async checkWithUpstash(identifier: string, category: EndpointCategory, config: RateLimitConfig): Promise<RateLimitResult> {
    const key = `ratelimit:${category}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const url = `${process.env.UPSTASH_REDIS_REST_URL}/zremrangebyscore/${key}/${windowStart}/${now}/zcard/${key}/expire/${key}/${Math.ceil(config.windowMs / 1000)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    });

    if (!response.ok) throw new Error(`Upstash error: ${response.status}`);
    const data = await response.json();
    const count = Array.isArray(data) ? (data[1] as number) ?? 0 : 0;

    if ((count + (config.cost ?? 1)) >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetIn: Math.ceil(config.windowMs / 1000), category, limit: config.maxRequests };
    }

    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/zadd/${key}/${now}/${now}`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    });

    return { allowed: true, remaining: config.maxRequests - count - (config.cost ?? 1), resetIn: Math.ceil(config.windowMs / 1000), category, limit: config.maxRequests };
  }

  private checkWithMemory(identifier: string, category: EndpointCategory, config: RateLimitConfig): RateLimitResult {
    const key = `${category}:${identifier}`;
    const now = Date.now();

    let entry = this.fallbackStore.get(key) ?? { timestamps: [], score: 0 };
    entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

    const cost = config.cost ?? 1;
    if (entry.timestamps.length + cost > config.maxRequests) {
      const oldest = entry.timestamps[0]!;
      const resetIn = Math.ceil((oldest + config.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, resetIn: Math.max(1, resetIn), category, limit: config.maxRequests };
    }

    for (let i = 0; i < cost; i++) entry.timestamps.push(now);
    this.fallbackStore.set(key, entry);
    return { allowed: true, remaining: config.maxRequests - entry.timestamps.length, resetIn: Math.ceil(config.windowMs / 1000), category, limit: config.maxRequests };
  }

  getConfig(category: EndpointCategory): RateLimitConfig {
    return RATE_LIMIT_CONFIGS[category] ?? RATE_LIMIT_CONFIGS.default;
  }
}

export const rateLimiter = new RateLimiter();
export default rateLimiter;
