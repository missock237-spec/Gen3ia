import { redis } from './redis-client';

const DEFAULT_TTL = 60; // secondes

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, value: T, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    console.error('[Cache] Set error:', err);
  }
}

export async function delCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.error('[Cache] Del error:', err);
  }
}

export function cacheKey(...parts: string[]): string {
  return `cache:${parts.join(':')}`;
}
