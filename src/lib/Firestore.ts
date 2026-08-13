import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getCache, setCache, cacheKey } from './cache';

let dbInstance: Firestore | null = null;

function initFirestore() {
  if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env variable is required');
    }
    initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
    });
  }
  return getFirestore();
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = initFirestore();
  }
  return dbInstance;
}

export const db = getDb();
export { FieldValue };

// ------------------------------------------------------------
// Helpers avec cache et retry
// ------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      // Exponential backoff : 100ms, 200ms, 400ms...
      const delay = Math.min(100 * Math.pow(2, i), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

/**
 * Lecture d'un document avec cache Redis (TTL 60s par défaut)
 */
export async function getCachedDoc<T>(
  collection: string,
  docId: string,
  ttl = 60
): Promise<T | null> {
  const key = cacheKey('firestore', collection, docId);
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;

  const doc = await withRetry(() => db.collection(collection).doc(docId).get());
  if (!doc.exists) return null;
  const data = doc.data() as T;
  await setCache(key, data, ttl);
  return data;
}

/**
 * Écriture avec invalidation du cache
 */
export async function setCachedDoc<T>(
  collection: string,
  docId: string,
  data: T,
  options?: { merge?: boolean }
): Promise<void> {
  await withRetry(() =>
    db.collection(collection).doc(docId).set(data, { merge: options?.merge ?? false })
  );
  // Invalider le cache
  const key = cacheKey('firestore', collection, docId);
  await redis.del(key); // Attention, redis importé via cache.ts
}

/**
 * Requête avec cache (pour les listes, attention à la clé)
 * Ici on ne cache que les résultats complets d'une requête spécifique.
 * À utiliser avec précaution (ex: pour des données statiques).
 */
export async function getCachedQuery<T>(
  queryKey: string,
  queryFn: () => Promise<T[]>,
  ttl = 30
): Promise<T[]> {
  const key = cacheKey('firestore', 'query', queryKey);
  const cached = await getCache<T[]>(key);
  if (cached !== null) return cached;

  const result = await withRetry(queryFn);
  await setCache(key, result, ttl);
  return result;
}
