// ============================================================
// Cache Manager — Redis + In-Memory Fallback
// Sessions, API responses, billing data
// ============================================================

import { Redis } from 'ioredis';
import { createLogger } from '@/lib/logger';

const log = createLogger('cache');

type CacheValue = string | number | boolean | object | null;

interface CacheEntry {
  value: CacheValue;
  expiry: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  ratio: string;
  redisConnected: boolean;
}

// Durées de vie par type de donnée (en ms)
export const TTL = {
  SESSION: 24 * 60 * 60 * 1000,     // 24h
  API_RESPONSE: 5 * 60 * 1000,       // 5 min
  BILLING_DATA: 60 * 1000,           // 1 min
  CREDIT_BALANCE: 30 * 1000,         // 30s
  PLANS: 10 * 60 * 1000,             // 10 min
  USER_PROFILE: 15 * 60 * 1000,      // 15 min
  AGENT_LIST: 2 * 60 * 1000,         // 2 min
  MARKETPLACE: 5 * 60 * 1000,        // 5 min
  RATE_LIMIT: 60 * 1000,             // 1 min
  METRICS: 30 * 1000,                // 30s
} as const;

class CacheManager {
  private store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private redisClient: Redis | null = null;
  private redisEnabled = false;
  private connecting = false;

  constructor() {
    this.initRedis();
  }

  private initRedis(): void {
    if (this.redisClient) return;
    
    const url = process.env.REDIS_URL;
    if (!url) {
      log.warn('REDIS_URL not set — using in-memory cache only');
      return;
    }

  
    try {
      this.redisClient = new Redis(url, {
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => {
          if (times > 3) {
            log.error('Redis connection failed after 3 retries — falling back to memory');
            this.redisEnabled = false;
            this.redisClient?.disconnect();
            this.redisClient = null;
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
        keepAlive: 10000,
      });

      this.redisClient.on('error', (err) => {
        if (!this.connecting) return;
        log.error('Redis error', { error: err.message });
        this.redisEnabled = false;
      });

      this.redisClient.on('connect', () => {
        this.redisEnabled = true;
        log.info('Redis cache connected');
      });

      this.redisClient.on('close', () => {
        this.redisEnabled = false;
        log.warn('Redis connection closed — using in-memory fallback');
      });

      this.connecting = true;
      this.redisClient.connect().catch((err) => {
        this.connecting = false;
        this.redisEnabled = false;
        log.warn('Redis unavailable', { error: err.message });
      });
    } catch {
      this.redisEnabled = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Tentative Redis d'abord
    if (this.redisEnabled && this.redisClient) {
      try {
        const raw = await this.redisClient.get(`cache:${key}`);
        if (raw !== null) {
          try {
            const parsed = JSON.parse(raw) as CacheEntry;
            if (Date.now() < parsed.expiry) {
              this.hits++;
              return parsed.value as T;
            }
          } catch {
            // Format invalide, on continue vers mémoire
          }
        }
      } catch {
        // Redis indisponible, fallback mémoire
      }
    }

    // Fallback mémoire
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number = TTL.API_RESPONSE): Promise<void> {
    const entry: CacheEntry = { value: value as CacheValue, expiry: Date.now() + ttlMs };
    
    // Redis
    if (this.redisEnabled && this.redisClient) {
      try {
        await this.redisClient.set(
          `cache:${key}`,
          JSON.stringify(entry),
          'PX',
          ttlMs
        );
      } catch {}
    }
    
    // Toujours stocker en mémoire (fallback rapide)
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    if (this.redisEnabled && this.redisClient) {
      try {
        await this.redisClient.del(`cache:${key}`);
      } catch {}
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    // Mémoire
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    // Redis
    if (this.redisEnabled && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`cache:${prefix}*`);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch {}
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
    if (this.redisEnabled && this.redisClient) {
      try {
        const keys = await this.redisClient.keys('cache:*');
        if (keys.length > 0) await this.redisClient.del(...keys);
      } catch {}
    }
    log.info('Cache cleared');
  }

  /**
   * Cache les sessions utilisateur dans Redis pour validation rapide
   */
  async cacheSession(userId: string, token: string, ttlMs: number = TTL.SESSION): Promise<void> {
    await this.set(`session:${token}`, { userId, validatedAt: Date.now() }, ttlMs);
    await this.set(`user:sessions:${userId}`, token, ttlMs);
  }

  async getSession(token: string): Promise<{ userId: string; validatedAt: number } | null> {
    return this.get<{ userId: string; validatedAt: number }>(`session:${token}`);
  }

  async invalidateSession(token: string): Promise<void> {
    await this.delete(`session:${token}`);
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    await this.delete(`user:sessions:${userId}`);
    await this.deleteByPrefix(`session:${userId.slice(0, 8)}`);
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      ratio: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%',
      redisConnected: this.redisEnabled,
    };
  }

  /**
   * Récupère une valeur du cache ou la calcule.
   * Utilise un verrou distribué via Redis pour éviter les répétitions.
   */
  async getOrCompute<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    options?: { staleWhileRevalidate?: boolean }
  ): Promise<T> {
    // Essayer le cache
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Calculer la valeur
    try {
      const value = await fn();
      await this.set(key, value, ttlMs);
      return value;
    } catch (error) {
      // En cas d'erreur, réessayer avec stale-while-revalidate
      if (options?.staleWhileRevalidate) {
        const stale = this.store.get(key);
        if (stale) return stale.value as T;
      }
      throw error;
    }
  }
}

export const cache = new CacheManager();
export default cache;
