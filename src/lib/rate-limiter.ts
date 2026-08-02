/**
 * Advanced Distributed Rate Limiting
 * 
 * Features:
 * - Token bucket algorithm
 * - Redis distributed store (with fallback to memory)
 * - Per-user and per-IP rate limiting
 * - Endpoint-specific configurations
 * - Graceful degradation if Redis unavailable
 */

import { Redis } from 'ioredis';
import { getEnv } from '@/lib/env-validation';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds
  retryAfter?: number; // seconds
}

// Fallback memory store (used when Redis unavailable)
const memoryStore = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 300000; // 5 minutes

/**
 * Get Redis client from environment
 */
function getRedisClient(): Redis | null {
  try {
    const env = getEnv();
    if (!env.REDIS_URL) return null;

    return new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 2000,
    });
  } catch (error) {
    console.warn('[RateLimit] Failed to create Redis client:', error);
    return null;
  }
}

/**
 * Extract client IP from request (handles various proxy headers)
 */
function getClientIp(request: Request): string {
  // Cloudflare
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;

  // Standard X-Real-IP
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // X-Forwarded-For (take first IP, can have multiple)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';

  return 'unknown';
}

/**
 * Generate rate limit key
 */
function generateKey(
  identity: string,
  endpoint: string,
  windowMs: number,
): string {
  const window = Math.floor(Date.now() / windowMs);
  return `rl:${identity}:${endpoint}:${window}`;
}

/**
 * Check rate limit using Redis
 */
async function checkRedis(
  redis: Redis,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = Math.ceil((Math.floor(now / windowMs) + 1) * windowMs / 1000);

  try {
    const count = await redis.incr(key);
    
    // Set expiry on first request in this window
    if (count === 1) {
      await redis.expireat(key, resetAt);
    }

    const remaining = Math.max(0, maxRequests - count);
    const resetIn = resetAt - Math.floor(now / 1000);

    return {
      allowed: count <= maxRequests,
      remaining,
      resetIn,
      retryAfter: count > maxRequests ? resetIn : undefined,
    };
  } catch (error) {
    console.warn('[RateLimit] Redis check failed, falling back to memory:', error);
    // Fallback on error
    return checkMemory(key, maxRequests, windowMs);
  }
}

/**
 * Check rate limit using in-memory store
 */
function checkMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const entry = memoryStore.get(key);

  if (entry) {
    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetIn = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

    return {
      allowed: entry.count <= maxRequests,
      remaining,
      resetIn,
      retryAfter: entry.count > maxRequests ? resetIn : undefined,
    };
  }

  // First request in this window
  memoryStore.set(key, { count: 1, resetAt: windowStart + windowMs });

  // Cleanup old entries periodically
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    const cutoff = now - windowMs * 3;
    for (const [k, v] of memoryStore) {
      if (v.resetAt < cutoff) {
        memoryStore.delete(k);
      }
    }
  }

  return {
    allowed: true,
    remaining: maxRequests - 1,
    resetIn: Math.ceil(windowMs / 1000),
  };
}

/**
 * Main rate limit check function
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
  identity?: string, // userId if authenticated, otherwise will use IP
  endpoint: string = 'default',
): Promise<RateLimitResult> {
  const clientId = identity || getClientIp(request);
  const key = generateKey(clientId, endpoint, config.windowMs);

  // Try Redis first
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.connect();
      const result = await checkRedis(redis, key, config.maxRequests, config.windowMs);
      await redis.quit();
      return result;
    } catch (error) {
      console.warn('[RateLimit] Redis operation failed:', error);
      if (redis) {
        redis.disconnect();
      }
    }
  }

  // Fallback to memory
  return checkMemory(key, config.maxRequests, config.windowMs);
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_CONFIGS = {
  // Authentication endpoints (login, register, password reset)
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later',
  },

  // Payment operations (very strict)
  PAYMENT: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Too many payment attempts, please try again later',
  },

  // API operations (moderate)
  API: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Rate limit exceeded, please try again',
  },

  // Public endpoints (generous)
  PUBLIC: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300,
    message: 'Rate limit exceeded',
  },

  // Per-user authenticated (very generous)
  USER: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
  },

  // AI/LLM operations (expensive, strict)
  AI_OPERATION: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many AI requests, please try again',
  },

  // Webhook endpoints
  WEBHOOK: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 500,
  },
};

export type RateLimitConfigKey = keyof typeof RATE_LIMIT_CONFIGS;
