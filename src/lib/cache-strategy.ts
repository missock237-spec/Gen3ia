/**
 * Multi-Layer Caching Strategy
 * 
 * 3-tier cache architecture for optimal performance:
 * Layer 1: CDN (Vercel Edge) - Static assets, TTL: 30 days
 * Layer 2: Redis - Session, agents, user data, TTL: 15-60 min
 * Layer 3: In-Memory - Computation results, TTL: 5-15 min
 */

import { getEnv } from '@/lib/env-validation';
import { logger } from '@/lib/logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheConfig {
  ttlSeconds: number;
  tags?: string[]; // For cache invalidation
}

/**
 * In-Memory Cache (Layer 3)
 */
class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize = 1000; // Max entries
  private accessCounts: Map<string, number> = new Map();

  set<T>(key: string, value: T, ttlSeconds: number): void {
    // LRU eviction if over capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
    });

    this.accessCounts.set(key, 0);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Track access for LRU
    this.accessCounts.set(key, (this.accessCounts.get(key) || 0) + 1);

    return entry.value as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.accessCounts.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessCounts.clear();
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let minAccess = Infinity;

    for (const [key, count] of this.accessCounts) {
      if (count < minAccess) {
        minAccess = count;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessCounts.delete(lruKey);
      logger.debug('LRU eviction', { key: lruKey });
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: Array.from(this.cache.keys()).slice(0, 10),
    };
  }
}

/**
 * Redis Cache (Layer 2)
 */
class RedisCache {
  private redis: any = null;
  private connected = false;

  async initialize(): Promise<void> {
    try {
      const env = getEnv();
      if (!env.REDIS_URL) {
        logger.debug('Redis not configured, using memory cache only');
        return;
      }

      const { createClient } = await import('redis');
      this.redis = createClient({ url: env.REDIS_URL });
      await this.redis.connect();
      this.connected = true;
      logger.info('Redis cache initialized');
    } catch (error) {
      logger.warn('Failed to initialize Redis cache', { error });
      this.connected = false;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void> {
    if (!this.connected || !this.redis) return;

    try {
      await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));

      // Store tags for cache invalidation
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          await this.redis.sadd(`tag:${tag}`, key);
          await this.redis.expire(`tag:${tag}`, ttlSeconds);
        }
      }
    } catch (error) {
      logger.warn('Redis set failed', { key, error });
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.redis) return null;

    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Redis get failed', { key, error });
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.connected || !this.redis) return;

    try {
      await this.redis.del(key);
    } catch (error) {
      logger.warn('Redis delete failed', { key, error });
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    if (!this.connected || !this.redis) return;

    try {
      const keys = await this.redis.smembers(`tag:${tag}`);
      if (keys.length > 0) {
        await this.redis.del(keys);
        logger.debug('Cache invalidated by tag', { tag, count: keys.length });
      }
      await this.redis.del(`tag:${tag}`);
    } catch (error) {
      logger.warn('Redis tag invalidation failed', { tag, error });
    }
  }

  async clear(): Promise<void> {
    if (!this.connected || !this.redis) return;

    try {
      await this.redis.flushDb();
      logger.info('Redis cache cleared');
    } catch (error) {
      logger.warn('Redis clear failed', { error });
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Multi-layer Cache Manager
 */
export class CacheManager {
  private memory = new MemoryCache();
  private redis: RedisCache;

  constructor() {
    this.redis = new RedisCache();
  }

  async initialize(): Promise<void> {
    await this.redis.initialize();
  }

  /**
   * Get from cache (checks all layers)
   */
  async get<T>(key: string): Promise<T | null> {
    // Try memory first (fastest)
    let value = this.memory.get<T>(key);
    if (value !== null) {
      logger.debug('Cache hit (memory)', { key });
      return value;
    }

    // Try Redis (fast)
    value = await this.redis.get<T>(key);
    if (value !== null) {
      logger.debug('Cache hit (redis)', { key });
      // Populate memory cache for next hit
      this.memory.set(key, value, 300); // 5 min TTL in memory
      return value;
    }

    logger.debug('Cache miss', { key });
    return null;
  }

  /**
   * Set in cache (all layers)
   */
  async set<T>(key: string, value: T, config: CacheConfig): Promise<void> {
    // Set in memory
    this.memory.set(key, value, Math.min(config.ttlSeconds, 900)); // Max 15 min in memory

    // Set in Redis
    await this.redis.set(key, value, config.ttlSeconds, config.tags);

    logger.debug('Cache set', { key, ttl: config.ttlSeconds, tags: config.tags });
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    await this.redis.delete(key);
    logger.debug('Cache deleted', { key });
  }

  /**
   * Invalidate by tag
   */
  async invalidateTag(tag: string): Promise<void> {
    await this.redis.invalidateTag(tag);
    logger.info('Cache invalidated by tag', { tag });
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.memory.clear();
    await this.redis.clear();
    logger.info('All cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memory: this.memory.getStats(),
      redis: { connected: this.redis.isConnected() },
    };
  }
}

// Singleton instance
let cacheManagerInstance: CacheManager | null = null;

/**
 * Get cache manager instance
 */
export async function getCacheManager(): Promise<CacheManager> {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
    await cacheManagerInstance.initialize();
  }
  return cacheManagerInstance;
}

/**
 * Cache wrapper for functions
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  config: CacheConfig = { ttlSeconds: 300 },
): Promise<T> {
  const cache = await getCacheManager();

  // Try to get from cache
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Execute function
  const result = await fn();

  // Store in cache
  await cache.set(key, result, config);

  return result;
}

/**
 * Predefined cache configs
 */
export const CACHE_CONFIGS = {
  // Session data: 30 minutes
  SESSION: { ttlSeconds: 1800, tags: ['session'] },

  // User data: 15 minutes
  USER: { ttlSeconds: 900, tags: ['user'] },

  // Agent data: 30 minutes
  AGENT: { ttlSeconds: 1800, tags: ['agent'] },

  // API responses: 5 minutes
  API_RESPONSE: { ttlSeconds: 300, tags: ['api'] },

  // Database query results: 10 minutes
  QUERY_RESULT: { ttlSeconds: 600, tags: ['query'] },

  // Public data: 1 hour
  PUBLIC: { ttlSeconds: 3600, tags: ['public'] },

  // Short-lived: 1 minute
  SHORT: { ttlSeconds: 60, tags: ['short'] },

  // Long-lived: 24 hours
  LONG: { ttlSeconds: 86400, tags: ['long'] },
};

export default CacheManager;
