// ============================================================
// Gen3ia — Cache Strategy (Phase 5.1 · Performance)
// Orchestre le caching multi-couche sans dupliquer la logique
// déjà portée par cache/cache-manager.ts (Redis + memory) :
//
//   CDN    -> assets statiques / images        (TTL ~ 1 mois)
//   Redis  -> sessions, agents, user data       (TTL 15-60 min)
//   DB     -> résultat de requêtes lourdes      (TTL 5-15 min)
//   Memory -> fonctions de calcul               (TTL dur shorter)
//
// Invalidation : event-driven (invalidateTags / invalidateByPrefix)
// + TTL à chaque couche. Tagging pour purge ciblée.
// ============================================================

import { createLogger } from '@/lib/logger';
import { cache, TTL } from '@/lib/cache/cache-manager';
import { fallbackStore } from '@/lib/fallback-store';

const log = createLogger('cache-strategy');

// ---------------------------------------------------------------------------
// Couches exposées
// ---------------------------------------------------------------------------

export type CacheLayer = 'cdn' | 'redis' | 'db' | 'memory';

/** Convention de TTL par couche (ms). */
export const LAYER_TTL: Record<CacheLayer, number> = {
  cdn: 30 * 24 * 60 * 60 * 1000, // ~1 mois (assets statiques)
  redis: 30 * 60 * 1000,          // 30 min (sessions, agents, user data)
  db: 10 * 60 * 1000,             // 10 min (résultats de requêtes)
  memory: 5 * 60 * 1000,          // 5 min (fonctions de calcul)
};

/** TTLs dédiés existants (réexport pratiques). */
export { TTL };

// ---------------------------------------------------------------------------
// Tags / invalidation event-driven
// ---------------------------------------------------------------------------

/** Pile de tags attachés à une clé pour purge ciblée. */
class TagIndex {
  private tagToKeys = new Map<string, Set<string>>();

  track(tag: string, key: string): void {
    let keys = this.tagToKeys.get(tag);
    if (!keys) {
      keys = new Set();
      this.tagToKeys.set(tag, keys);
    }
    keys.add(key);
  }

  keysFor(tag: string): string[] {
    return Array.from(this.tagToKeys.get(tag) ?? []);
  }

  untrackTag(tag: string): string[] {
    const keys = this.keysFor(tag);
    this.tagToKeys.delete(tag);
    return keys;
  }

  untrackKey(key: string): void {
    for (const [tag, keys] of this.tagToKeys) {
      keys.delete(key);
      if (keys.size === 0) this.tagToKeys.delete(tag);
    }
  }

  /** Nombre de tags indexés. */
  get size(): number {
    return this.tagToKeys.size;
  }
}

const tagIndex = new TagIndex();

// ---------------------------------------------------------------------------
// CacheStrategy
// ---------------------------------------------------------------------------

class CacheStrategy {
  private warmupQueue: Array<{ key: string; tags: string[]; ttl: number; loader: () => Promise<unknown> }> = [];
  private warming = new Set<string>();

  // -------------------------------------------------------------------------
  // Lecture multi-couche
  // -------------------------------------------------------------------------

  /**
   * Lit via le CacheManager (Redis + mémoire). Si miss, calcule via loader,
   * stocke, et attache les tags pour invalidation event-driven.
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    options: {
      layer?: CacheLayer;
      ttlMs?: number;
      tags?: string[];
      staleWhileRevalidate?: boolean;
    } = {},
  ): Promise<T> {
    const ttlMs = options.ttlMs ?? LAYER_TTL[options.layer ?? 'db'];

    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;

    // Cache-aside avec protection de reentrance (thundering herd)
    if (this.warming.has(key)) {
      const pending = fallbackStore.getSnapshot<T>(key);
      if (pending !== null) return pending;
    }

    this.warming.add(key);
    try {
      const value = await loader();
      await cache.set(key, value, ttlMs);
      // Snapshot de secours (dégradation DB) + index de tags
      fallbackStore.setSnapshot(key, value, ttlMs);
      for (const tag of options.tags ?? []) {
        tagIndex.track(tag, key);
      }
      return value;
    } catch (error) {
      // stale-while-revalidate : sert la dernière valeur connue
      if (options.staleWhileRevalidate) {
        const stale = fallbackStore.getSnapshot<T>(key);
        if (stale !== null) return stale;
      }
      throw error;
    } finally {
      this.warming.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // Invalidation event-driven
  // -------------------------------------------------------------------------

  /** Invalide toutes les clés attachées à un tag (ex: 'user:123', 'agent:456'). */
  async invalidateTags(tags: string[]): Promise<void> {
    const keysToClear = new Set<string>();
    for (const tag of tags) {
      const keys = tagIndex.untrackTag(tag);
      for (const k of keys) keysToClear.add(k);
      fallbackStore.clearSnapshot(`tag:${tag}`);
    }
    for (const key of keysToClear) {
      await cache.delete(key);
      fallbackStore.clearSnapshot(key);
    }
    if (keysToClear.size > 0) {
      log.info('cache_invalidated', { tags, keys: keysToClear.size });
    }
  }

  /** Invalide par préfixe (ex: 'user:123:*'). */
  async invalidateByPrefix(prefix: string): Promise<void> {
    await cache.deleteByPrefix(prefix);
    log.info('cache_invalidated_by_prefix', { prefix });
  }

  /** Vide tous les caches. */
  async clearAll(): Promise<void> {
    await cache.clear();
    log.info('cache_cleared_all');
  }

  // -------------------------------------------------------------------------
  // Warmup (post-deploy / démarrage)
  // -------------------------------------------------------------------------

  /** Enregistre une entrée à précharger. */
  scheduleWarmup(opts: { key: string; tags?: string[]; ttl?: number; loader: () => Promise<unknown> }): void {
    this.warmupQueue.push({
      key: opts.key,
      tags: opts.tags ?? [],
      ttl: opts.ttl ?? LAYER_TTL.redis,
      loader: opts.loader,
    });
  }

  /** Précharge les entrées enregistrées. */
  async runWarmup(): Promise<number> {
    let loaded = 0;
    for (const item of this.warmupQueue) {
      try {
        await this.getOrSet(item.key, item.loader, {
          layer: 'redis',
          ttlMs: item.ttl,
          tags: item.tags,
        });
        loaded++;
      } catch (error) {
        log.warn('warmup_failed', {
          key: item.key,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    this.warmupQueue = [];
    log.info('warmup_complete', { loaded });
    return loaded;
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getCoverage(): { tags: number; queuedWarmups: number; cacheStats: ReturnType<typeof cache.getStats> } {
    return {
      tags: tagIndex.size,
      queuedWarmups: this.warmupQueue.length,
      cacheStats: cache.getStats(),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const cacheStrategy = new CacheStrategy();
export default cacheStrategy;
