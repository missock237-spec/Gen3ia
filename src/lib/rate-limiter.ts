// ============================================================
// Rate Limiter — Distribué via Redis (ioredis / Upstash) + fallback mémoire
// Phase 2.2 — Rate limiting distribué
// - Limite par utilisateur (identity) et par IP (fallback)
// - Limite par ENDPOINT : categories AUTH, PAYMENT, API et défaut
// - Token bucket (burst contrôlé) via Redis (multi-instance)
// - Fallback mémoire propre quand Redis indisponible
// Compatible Vercel Edge, Serverless, et Docker multi-instances
// ============================================================

import { Redis } from 'ioredis';

// ---------- Politiques par catégorie d'endpoint (token bucket) ----------
export type RateLimitScope = 'default' | 'auth' | 'payment' | 'api';

interface Policy {
  /** capacite du bucket (burst max) */
  capacity: number;
  /** taux de remplissage par minute */
  refillPerMin: number;
  /** fenêtre d'affichage pour les headers X-RateLimit-Reset (secondes) */
  windowSec: number;
}

const POLICIES: Record<RateLimitScope, Policy> = {
  default: { capacity: 100, refillPerMin: 100, windowSec: 60 },
  auth:    { capacity: 10,  refillPerMin: 10,  windowSec: 60 },   // login/2FA/register : strict
  payment: { capacity: 20,  refillPerMin: 20,  windowSec: 60 },   // webhooks/intents
  api:     { capacity: 300, refillPerMin: 300, windowSec: 60 },   // routeurs API / agents
};

// ---------- Fallback mémoire (utilisé quand Redis n'est pas disponible) ----------
const memoryStore = new Map<
  string,
  { tokens: number; lastRefill: number }
>();
let lastCleanup = Date.now();
const CLEANUP_INT = 300000; // 5 min

function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  if (!url) return null;
  try {
    return new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });
  } catch {
    return null;
  }
}

export function getClientIp(request: Request): string {
  // Ne pas faire confiance à x-forwarded-for seul (spoofable côté client)
  const cf = request.headers.get('cf-connecting-ip'); // Cloudflare
  if (cf) return cf;
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

/** Devine la catégorie d'endpoint à partir du path pour appliquer la bonne politique. */
export function scopeForPath(pathname: string): RateLimitScope {
  if (/\/(auth|api\/auth|api\/oauth|api\/twofa|register|signin|signup)/.test(pathname)) return 'auth';
  if (/\/payment|\/stripe|\/sebpay|\/api\/(payments|billing|credits|webhooks)/.test(pathname)) return 'payment';
  if (/^\/api\//.test(pathname)) return 'api';
  return 'default';
}

function getRateLimitKey(request: Request, scope: RateLimitScope, endpoint: string, userId?: string): string {
  const ip = getClientIp(request);
  const identity = userId || ip;
  // clé incluant endpoint + scope pour des limites par ressource
  return `rl:${scope}:${endpoint}:${identity}`;
}

async function checkRedis(redis: Redis, key: string, policy: Policy): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const script = `
    local key = KEYS[1]
    local cap = tonumber(ARGV[1])
    local refillPerMs = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])
    local data = redis.call('HMGET', key, 'tokens', 'ts')
    local tokens = tonumber(data[1]) or cap
    local ts = tonumber(data[2]) or now
    tokens = math.min(cap, tokens + (now - ts) * refillPerMs)
    local allowed = 1
    if tokens < 1 then allowed = 0 else tokens = tokens - 1 end
    redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
    redis.call('EXPIRE', key, ttl)
    return {allowed, math.floor(tokens)}
  `;
  try {
    const res = (await redis.eval(
      script, 1, key,
      String(policy.capacity),
      String(policy.refillPerMin / 60000),
      String(now),
      String(policy.windowSec),
    )) as [number, number];
    const allowed = Number(res[0]) === 1;
    const remaining = Number(res[1]);
    return { allowed, remaining, resetIn: policy.windowSec };
  } catch {
    return { allowed: true, remaining: policy.capacity, resetIn: policy.windowSec }; // fail-open si erreur Redis
  }
}

function checkMemory(key: string, policy: Policy): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { tokens: policy.capacity, lastRefill: now };
    memoryStore.set(key, entry);
  }
  // refill
  entry.tokens = Math.min(policy.capacity, entry.tokens + (now - entry.lastRefill) * (policy.refillPerMin / 60000));
  entry.lastRefill = now;
  const allowed = entry.tokens >= 1;
  if (allowed) entry.tokens -= 1;
  const remaining = Math.floor(entry.tokens);

  // cleanup périodique
  if (now - lastCleanup > CLEANUP_INT) {
    lastCleanup = now;
    for (const [k, v] of memoryStore) {
      if (now - v.lastRefill > policy.windowSec * 1000 * 2) memoryStore.delete(k);
    }
  }
  return { allowed, remaining, resetIn: policy.windowSec };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  limit: number;
  scope: RateLimitScope;
}

/**
 * Fonction principale améliorée (rétrocompatible avec l'ancienne signature).
 * @param request  Request
 * @param userId   (optionnel) identité authentifiée
 * @param scope    catégorie d'endpoint (défaut: devinée depuis pathname)
 * @param endpoint (optionnel) clé explicite de l'endpoint
 */
export async function rateLimit(
  request: Request,
  userId?: string,
  scope?: RateLimitScope,
  endpoint?: string,
): Promise<RateLimitResult> {
  const url = new URL(request.url);
  const resolvedScope = scope ?? scopeForPath(url.pathname);
  const resolvedEndpoint = endpoint ?? url.pathname;
  const policy = POLICIES[resolvedScope];
  const key = getRateLimitKey(request, resolvedScope, resolvedEndpoint, userId);

  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await checkRedis(redis, key, policy);
      redis.disconnect();
      return { ...result, limit: policy.capacity, scope: resolvedScope };
    } catch {
      try { redis.disconnect(); } catch { /* noop */ }
    }
  }
  // Fallback mémoire
  const mem = checkMemory(key, policy);
  return { ...mem, limit: policy.capacity, scope: resolvedScope };
}

/** Version synchrone pour le middleware (défaut: mémoire uniquement). */
export function checkRateLimit(request: Request, scope: RateLimitScope = 'default'): boolean {
  const url = new URL(request.url);
  const resolvedScope = scope === 'default' ? scopeForPath(url.pathname) : scope;
  const policy = POLICIES[resolvedScope];
  const key = getRateLimitKey(request, resolvedScope, url.pathname);
  return checkMemory(key, policy).allowed;
}

/**
 * Rate limiter object with a `check` method for convenience.
 * Used by routes that import { rateLimiter } from '@/lib/rate-limiter'.
 */
export const rateLimiter = {
  async check(identifier: string, endpoint: string): Promise<{ allowed: boolean; resetIn: number }> {
    const policy = POLICIES.api;
    const key = `rl:api:${endpoint}:${identifier}`;
    const mem = checkMemory(key, policy);
    return { allowed: mem.allowed, resetIn: mem.resetIn };
  },
};
