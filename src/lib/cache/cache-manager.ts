import { Redis } from "ioredis";
import { logger } from "@/lib/logger";

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
}

class CacheManager {
  private store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private redisClient: Redis | null = null;
  private redisEnabled = false;

  constructor() { this.initRedis(); }

  private initRedis(): void {
    if (process.env.REDIS_URL && !this.redisClient) {
      try {
        this.redisClient = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        this.redisClient.on("error", () => { this.redisEnabled = false; });
        this.redisClient.connect().then(() => {
          this.redisEnabled = true;
          logger.info("Redis cache connected");
        }).catch(() => {
          this.redisEnabled = false;
          logger.warn("Redis unavailable, using in-memory cache only");
        });
      } catch { this.redisEnabled = false; }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redisEnabled && this.redisClient) {
      try {
        const raw = await this.redisClient.get(`cache:${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry;
          if (Date.now() < parsed.expiry) { this.hits++; return parsed.value as T; }
        }
      } catch {}
    }
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return null; }
    if (Date.now() > entry.expiry) { this.store.delete(key); this.misses++; return null; }
    this.hits++;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs = 60000): Promise<void> {
    const entry: CacheEntry = { value: value as CacheValue, expiry: Date.now() + ttlMs };
    if (this.redisEnabled && this.redisClient) {
      try { await this.redisClient.set(`cache:${key}`, JSON.stringify(entry), "PX", ttlMs); } catch {}
    }
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    if (this.redisEnabled && this.redisClient) {
      try { await this.redisClient.del(`cache:${key}`); } catch {}
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
    if (this.redisEnabled && this.redisClient) {
      try {
        const keys = await this.redisClient.keys("cache:*");
        if (keys.length > 0) await this.redisClient.del(...keys);
      } catch {}
    }
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return { size: this.store.size, hits: this.hits, misses: this.misses, ratio: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : "0%" };
  }

  async getOrCompute<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlMs);
    return value;
  }
}

export const cache = new CacheManager();
