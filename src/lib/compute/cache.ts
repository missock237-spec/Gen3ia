import { createLogger } from '@/lib/logger';

const log = createLogger('compute-cache');

interface CacheEntry<T> {
  key: string;
  data: T;
  size: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  createdAt: number;
  priority: CachePriority;
}

export type CachePriority = 'low' | 'normal' | 'high' | 'critical';

const PRIORITY_TTL_MS: Record<CachePriority, number> = {
  low: 30_000,
  normal: 120_000,
  high: 600_000,
  critical: 3_600_000,
};

const PRIORITY_MAX_SIZE: Record<CachePriority, number> = {
  low: 100,
  normal: 500,
  high: 200,
  critical: 50,
};

export class ComputeCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxTotalEntries: number;
  private maxTotalSizeBytes: number;
  private currentSizeBytes: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(options?: { maxEntries?: number; maxSizeMB?: number }) {
    this.maxTotalEntries = options?.maxEntries || 1000;
    this.maxTotalSizeBytes = (options?.maxSizeMB || 50) * 1024 * 1024;
    log.info('ComputeCache initialized', {
      maxEntries: this.maxTotalEntries,
      maxSizeMB: (options?.maxSizeMB || 50),
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.currentSizeBytes -= entry.size;
      this.misses++;
      return null;
    }
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, priority: CachePriority = 'normal', customTTLMs?: number): void {
    const serialized = this.serialize(data);
    const size = serialized.length;
    const ttl = customTTLMs || PRIORITY_TTL_MS[priority];
    const maxForPriority = PRIORITY_MAX_SIZE[priority];

    const priorityCount = this.countByPriority(priority);
    if (priorityCount >= maxForPriority) {
      this.evictByPriority(priority, Math.ceil(maxForPriority * 0.3));
    }

    while (this.currentSizeBytes + size > this.maxTotalSizeBytes && this.cache.size > 0) {
      this.evictLRU();
    }

    while (this.cache.size >= this.maxTotalEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry<unknown> = {
      key,
      data,
      size,
      expiresAt: Date.now() + ttl,
      accessCount: 0,
      lastAccessedAt: Date.now(),
      createdAt: Date.now(),
      priority,
    };

    const existing = this.cache.get(key);
    if (existing) {
      this.currentSizeBytes -= existing.size;
    }

    this.cache.set(key, entry);
    this.currentSizeBytes += size;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.currentSizeBytes -= entry.size;
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.currentSizeBytes -= entry.size;
      return true;
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    log.info('ComputeCache cleared');
  }

  getStats(): {
    entries: number;
    currentSizeMB: number;
    maxSizeMB: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
  } {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      currentSizeMB: Math.round((this.currentSizeBytes / (1024 * 1024)) * 100) / 100,
      maxSizeMB: Math.round(this.maxTotalSizeBytes / (1024 * 1024)),
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 10000) / 100 : 0,
      evictions: this.evictions,
    };
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.currentSizeBytes -= entry.size;
        removed++;
      }
    }
    if (removed > 0) {
      log.info('Cache cleanup completed', { removed, remaining: this.cache.size });
    }
    return removed;
  }

  private serialize<T>(data: T): string {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private countByPriority(priority: CachePriority): number {
    let count = 0;
    for (const entry of this.cache.values()) {
      if (entry.priority === priority) count++;
    }
    return count;
  }

  private evictByPriority(priority: CachePriority, count: number): void {
    const candidates = Array.from(this.cache.entries())
      .filter(([, entry]) => entry.priority === priority)
      .sort((a, b) => {
        const scoreA = a[1].accessCount / Math.max(1, (Date.now() - a[1].createdAt) / 1000);
        const scoreB = b[1].accessCount / Math.max(1, (Date.now() - b[1].createdAt) / 1000);
        return scoreA - scoreB;
      });

    for (let i = 0; i < Math.min(count, candidates.length); i++) {
      const [key, entry] = candidates[i];
      this.cache.delete(key);
      this.currentSizeBytes -= entry.size;
      this.evictions++;
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestPriority: CachePriority | null = null;

    for (const [key, entry] of this.cache) {
      const priorityOrder: Record<CachePriority, number> = { low: 0, normal: 1, high: 2, critical: 3 };
      const currentPriority = priorityOrder[entry.priority];
      const lowestPriorityOrder = lowestPriority ? priorityOrder[lowestPriority] : 99;

      if (currentPriority < (lowestPriorityOrder ?? 99) ||
          (currentPriority === (lowestPriorityOrder ?? 99) && entry.lastAccessedAt < oldestTime)) {
        oldestKey = key;
        oldestTime = entry.lastAccessedAt;
        lowestPriority = entry.priority;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (entry) {
        this.currentSizeBytes -= entry.size;
        this.evictions++;
      }
    }
  }
}

export function createComputeCache(options?: { maxEntries?: number; maxSizeMB?: number }): ComputeCache {
  return new ComputeCache(options);
}