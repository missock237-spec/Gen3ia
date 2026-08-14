/**
 * Execution Caching System
 * 
 * Optimizes performance through intelligent result caching:
 * - Per-block result caching with TTL
 * - Cache invalidation strategies (time-based, manual, event-based)
 * - Configurable cache keys
 * - Cache hit/miss metrics
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('execution-cache');

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
  blockId: string;
  metadata?: Record<string, any>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  memoryUsageMB: number;
}

export interface CacheConfig {
  ttlSeconds?: number;
  maxSize?: number;
  keyPrefix?: string;
  enabled?: boolean;
}

class ExecutionCache {
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0,
  };
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;
  private blockConfigs = new Map<string, CacheConfig>();

  constructor() {
    this.setupCleanup();
  }

  /**
   * Periodically remove expired entries
   */
  private setupCleanup(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  /**
   * Set cache configuration for a block
   */
  configureBlock(blockId: string, config: CacheConfig): void {
    this.blockConfigs.set(blockId, {
      ttlSeconds: this.DEFAULT_TTL_SECONDS,
      enabled: true,
      ...config,
    });
  }

  /**
   * Generate cache key
   */
  private generateKey(
    blockId: string,
    input?: Record<string, any>,
    prefix?: string,
  ): string {
    const blockPrefix = prefix || blockId;
    if (!input || Object.keys(input).length === 0) {
      return blockPrefix;
    }

    const inputHash = this.hashObject(input);
    return `${blockPrefix}:${inputHash}`;
  }

  /**
   * Simple hash function for objects
   */
  private hashObject(obj: Record<string, any>): string {
    const json = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get value from cache
   */
  get<T = any>(
    blockId: string,
    input?: Record<string, any>,
  ): T | null {
    const config = this.blockConfigs.get(blockId);
    if (!config?.enabled) {
      return null;
    }

    const key = this.generateKey(blockId, input, config.keyPrefix);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update hit count
    entry.hitCount++;
    this.stats.hits++;

    log.debug('Cache hit', {
      blockId,
      key,
      hitCount: entry.hitCount,
    });

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set<T = any>(
    blockId: string,
    value: T,
    input?: Record<string, any>,
    ttlSeconds?: number,
  ): void {
    const config = this.blockConfigs.get(blockId);
    if (!config?.enabled) {
      return;
    }

    // Check cache size limit
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove least recently used entry
      const lruKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].hitCount - b[1].hitCount,
      )[0]?.[0];

      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    const key = this.generateKey(blockId, input, config.keyPrefix);
    const ttl = ttlSeconds ?? config.ttlSeconds ?? this.DEFAULT_TTL_SECONDS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt,
      hitCount: 0,
      blockId,
    };

    this.cache.set(key, entry);

    log.debug('Cache set', {
      blockId,
      key,
      ttlSeconds: ttl,
    });
  }

  /**
   * Check if value exists in cache
   */
  has(blockId: string, input?: Record<string, any>): boolean {
    const config = this.blockConfigs.get(blockId);
    if (!config?.enabled) {
      return false;
    }

    const key = this.generateKey(blockId, input, config.keyPrefix);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate all cache for a block
   */
  invalidateBlock(blockId: string): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.blockId === blockId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    log.info('Block cache invalidated', {
      blockId,
      entriesRemoved: keysToDelete.length,
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(blockId: string, input?: Record<string, any>): void {
    const key = this.generateKey(blockId, input);
    const deleted = this.cache.delete(key);

    if (deleted) {
      log.debug('Cache entry invalidated', { blockId, key });
    }
  }

  /**
   * Invalidate all cache
   */
  invalidateAll(): void {
    this.cache.clear();
    log.info('All cache invalidated');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalHitsAndMisses = this.stats.hits + this.stats.misses;
    const hitRate = totalHitsAndMisses > 0 ? this.stats.hits / totalHitsAndMisses : 0;

    // Rough memory estimation (assume ~1KB per entry)
    const memoryUsageMB = (this.cache.size * 1) / 1024;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      totalEntries: this.cache.size,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      log.debug('Cache cleanup', { removedEntries: keysToDelete.length });
    }
  }

  /**
   * Get cache entries for monitoring
   */
  getEntries(blockId?: string, limit: number = 100): CacheEntry<any>[] {
    const entries = Array.from(this.cache.values());

    if (blockId) {
      return entries.filter(e => e.blockId === blockId).slice(0, limit);
    }

    return entries.slice(0, limit);
  }

  /**
   * Warm cache with predefined values (for common queries)
   */
  warmCache(blockId: string, values: Array<{ input?: Record<string, any>; value: any; ttlSeconds?: number }>): void {
    for (const { input, value, ttlSeconds } of values) {
      this.set(blockId, value, input, ttlSeconds);
    }

    log.info('Cache warmed', {
      blockId,
      entries: values.length,
    });
  }
}

export const executionCache = new ExecutionCache();
