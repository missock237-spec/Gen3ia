/* ============================================================
 * P1 — Rate Limiter (Redis + fallback mémoire)
 * Conforme façade Firestore : aucune $executeRawUnsafe/_sum.
 * ============================================================ */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimitOptions {
  windowSec?: number;
  max?: number;
  key: string;
  bypass?: boolean;
}

interface Slot { count: number; resetAt: number }

// --- Redis (prod / distribué) ---
// ioredis en option ; sans RATE_LIMIT_REDIS_URL -> fallback mémoire.
let gRedis: { incr(k: string): Promise<number>; expire(k: string, s: number): Promise<unknown>; ttl(k: string): Promise<number> } | null = null;

export function setRedisClient(client: typeof gRedis) { gRedis = client; }

async function redisInc(key: string, windowSec: number, max: number): Promise<RateLimitResult> {
  if (!gRedis) return { ok: false, retryAfterSec: windowSec };
  const rk = `ratelimit:${key}`;
  const current = await gRedis.incr(rk);
  if (current === 1) await gRedis.expire(rk, windowSec);
  if (current > max) {
    const ttl = (await gRedis.ttl(rk)) || windowSec;
    return { ok: false, retryAfterSec: ttl };
  }
  return { ok: true };
}

// --- Mémoire (dev / single instance) ---
const mem = new Map<string, Slot>();

async function memInc(key: string, windowSec: number, max: number): Promise<RateLimitResult> {
  const now = Date.now();
  let slot = mem.get(key);
  if (!slot || slot.resetAt <= now) {
    slot = { count: 0, resetAt: now + windowSec * 1000 };
    mem.set(key, slot);
  }
  slot.count += 1;
  if (slot.count > max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((slot.resetAt - now) / 1000)) };
  }
  if (mem.size > 10_000) {
    for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  }
  return { ok: true };
}

export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, windowSec = 60, max = 100, bypass = false } = options;
  if (bypass) return { ok: true };
  const fullKey = `${windowSec}:${max}:${key}`;
  if (gRedis) return redisInc(fullKey, windowSec, max);
  return memInc(fullKey, windowSec, max);
}

export function rateLimitHeaders(result: RateLimitResult, max: number): Record<string, string> {
  const base: Record<string, string> = { "X-RateLimit-Limit": String(max) };
  if (!result.ok) {
    base["Retry-After"] = String(result.retryAfterSec);
    base["X-RateLimit-Remaining"] = "0";
  }
  return base;
}
