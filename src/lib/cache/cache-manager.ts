class CacheManager {
  private store = new Map<string, { value: unknown; expiry: number }>();
  private hits = 0; private misses = 0;
  get<T>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) { this.misses++; return null; }
    if (Date.now() > e.expiry) { this.store.delete(key); this.misses++; return null; }
    this.hits++; return e.value as T;
  }
  set<T>(key: string, value: T, ttlMs = 60000) { this.store.set(key, { value, expiry: Date.now() + ttlMs }); }
  delete(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  getStats() { const t = this.hits + this.misses; return { size: this.store.size, hits: this.hits, misses: this.misses, ratio: t > 0 ? (this.hits / t * 100).toFixed(1) + '%' : '0%' }; }
  async getOrCompute<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> { const c = this.get<T>(key); if (c !== null) return c; const v = await fn(); this.set(key, v, ttlMs); return v; }
}
export const cache = new CacheManager();