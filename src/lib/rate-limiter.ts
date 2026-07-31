// ============================================================
// Rate Limiter — Distribue via Redis (Upstash) ou fallback memoire
// Compatible Vercel Edge, Serverless, et Docker multi-instances
// ============================================================

import { Redis } from 'ioredis';

const WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS = 100; // 100 req/min

// Fallback memoire (utilise quand Redis n'est pas disponible)
const memoryStore = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();
const CLEANUP_INT = 300000; // 5 min

function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  if (!url) return null;
  try {
    return new Redis(url, { maxRetriesPerRequest: 1, retryStrategy: () => null, lazyConnect: true });
  } catch { return null; }
}

function getClientIp(request: Request): string {
  // Ne pas faire confiance a x-forwarded-for seul
  const cf = request.headers.get('cf-connecting-ip'); // Cloudflare
  if (cf) return cf;
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

function getRateLimitKey(request: Request, userId?: string): string {
  const ip = getClientIp(request);
  const now = Math.floor(Date.now() / WINDOW_MS);
  // Utiliser userId si disponible (plus fiable que IP)
  const identity = userId || ip;
  return `ratelimit:${identity}:${now}`;
}

async function checkRedis(redis: Redis, key: string): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const resetAt = Math.ceil((Math.floor(now / WINDOW_MS) + 1) * WINDOW_MS / 1000);
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expireat(key, resetAt);
    const remaining = Math.max(0, MAX_REQUESTS - count);
    return { allowed: count <= MAX_REQUESTS, remaining, resetIn: resetAt - Math.floor(now / 1000) };
  } catch {
    return { allowed: true, remaining: MAX_REQUESTS, resetIn: 60 };
  }
}

function checkMemory(key: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const ws = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const entry = memoryStore.get(key);
  if (entry) {
    entry.count++;
    const remaining = Math.max(0, MAX_REQUESTS - entry.count);
    return { allowed: entry.count <= MAX_REQUESTS, remaining, resetIn: Math.max(1, Math.ceil((ws + WINDOW_MS - now) / 1000)) };
  }
  memoryStore.set(key, { count: 1, resetAt: ws + WINDOW_MS });
  if (now - lastCleanup > CLEANUP_INT) {
    lastCleanup = now;
    const cut = now - WINDOW_MS * 2;
    for (const [k, v] of memoryStore) { if (v.resetAt < cut) memoryStore.delete(k); }
  }
  return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: 60 };
}

export async function rateLimit(
  request: Request,
  userId?: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = getRateLimitKey(request, userId);

  // Essayer Redis d'abord (distribue, fiable)
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await checkRedis(redis, key);
      redis.disconnect();
      return result;
    } catch {
      redis.disconnect();
    }
  }

  // Fallback memoire (dev, Docker mono-instance)
  return checkMemory(key);
}

// Version simplifiee pour le middleware (synchrone)
export function checkRateLimit(request: Request): boolean {
  const key = getRateLimitKey(request);
  const { allowed } = checkMemory(key);
  return allowed;
}
