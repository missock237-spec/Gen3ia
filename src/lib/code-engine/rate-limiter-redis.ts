/**
 * Rate Limiter distribue — base sur Redis/ioredis
 * 
 * Utilisable en production avec plusieurs instances.
 * Fallback automatique sur la version memoire si Redis indisponible.
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || process.env.KV_URL || '';

let redisClient: Redis | null = null;
let redisAvailable = false;

// Fallback memoire
const memStore = new Map<string, { count: number; resetAt: number }>();

try {
  if (REDIS_URL) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 2000),
      lazyConnect: true,
    });
    redisClient.on('error', () => { redisAvailable = false; });
    redisClient.on('connect', () => { redisAvailable = true; });
  }
} catch {
  redisAvailable = false;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  source: 'redis' | 'memory';
}

/**
 * Verifie le rate-limit pour une cle
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = Math.ceil((now + windowMs) / 1000);

  // Essayer Redis d'abord
  if (redisClient && redisAvailable) {
    try {
      const redisKey = 'ratelimit:' + key;
      const result = await redisClient
        .multi()
        .incr(redisKey)
        .ttl(redisKey)
        .exec();

      if (result) {
        const count = result[0]?.[1] as number || 0;
        let ttl = result[1]?.[1] as number || -1;

        if (ttl === -1 && count === 1) {
          await redisClient.expire(redisKey, Math.ceil(windowMs / 1000));
          ttl = Math.ceil(windowMs / 1000);
        }

        const remaining = Math.max(0, maxRequests - count);
        return {
          ok: count <= maxRequests,
          remaining,
          resetAt: Math.ceil(Date.now() / 1000) + Math.max(0, ttl),
          source: 'redis',
        };
      }
    } catch {
      redisAvailable = false;
    }
  }

  // Fallback memoire
  const memEntry = memStore.get(key);
  if (!memEntry || now > memEntry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxRequests - 1, resetAt: now + windowMs, source: 'memory' };
  }

  memEntry.count++;
  if (memEntry.count > maxRequests) {
    return { ok: false, remaining: 0, resetAt: memEntry.resetAt, source: 'memory' };
  }

  return { ok: true, remaining: maxRequests - memEntry.count, resetAt: memEntry.resetAt, source: 'memory' };
}

/**
 * Nettoie les entrees du fallback memoire expirees
 */
export function cleanupMemoryStore(): void {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now > entry.resetAt) memStore.delete(key);
  }
}

// Nettoyage toutes les minutes
setInterval(cleanupMemoryStore, 60000);

/**
 * Verifie si Redis est disponible
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Cree un rate-limiter specifique pour un use case
 */
export function createRateLimiter(name: string, defaultMax: number = 10, defaultWindow: number = 60000) {
  return {
    check: (key: string, max?: number, window?: number) =>
      checkRateLimit(name + ':' + key, max || defaultMax, window || defaultWindow),
    
    middleware: (max?: number, window?: number) => {
      return async (req: { headers: Headers; geo?: { ip?: string } }, res: { status: (code: number) => { json: (data: unknown) => void } }, next: () => void) => {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   req.geo?.ip || 'unknown';
        const result = await checkRateLimit(name + ':ip:' + ip, max || defaultMax, window || defaultWindow);
        if (!result.ok) {
          return res.status(429).json({
            error: 'Trop de requetes. Reessaye dans ' + Math.ceil((result.resetAt - Date.now()) / 1000) + 's',
            remaining: 0,
          });
        }
        return next();
      };
    },

    status: () => ({
      available: redisAvailable,
      source: redisAvailable ? 'redis' : 'memory',
      storeSize: memStore.size,
    }),
  };
}

// Rate-limiteurs pre-configures
export const codeExecutionLimiter = createRateLimiter('code:exec', 10, 60000);
export const apiGatewayLimiter = createRateLimiter('gateway', 30, 60000);
export const orchestrationLimiter = createRateLimiter('orchestrate', 5, 60000);
export const generationLimiter = createRateLimiter('generate', 20, 60000);
export const deployLimiter = createRateLimiter('deploy', 5, 60000);
export const authLimiter = createRateLimiter('auth', 20, 60000);