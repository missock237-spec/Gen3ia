// ============================================================
// Gen3ia — Cache & Service Worker reset utilities (client-side)
// ============================================================
//  Utilitaires pour forcer un "hard reload" côté client :
//    - Désinscrire TOUS les service workers
//    - Vider TOUS les caches (CacheStorage API)
//    - Recharger la page en contournant le cache HTTP
//
//  Utilisé par page.tsx quand hydrate() reste bloqué plus de 12s
//  (symptôme : spinner "Chargement de Gen3ia..." qui ne disparaît jamais
//   à cause d'un Service Worker v1/v2 qui sert du JS obsolète).
// ============================================================

'use client';

/**
 * Désinscrit TOUS les service workers enregistrés sur ce domaine.
 * Renvoie le nombre de SW désinscrits.
 */
export async function unregisterAllServiceWorkers(): Promise<number> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 0;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    let count = 0;
    for (const reg of registrations) {
      try {
        await reg.unregister();
        count++;
        console.log('[gen3ia/reset] SW unregistered:', reg.scope);
      } catch (err) {
        console.warn('[gen3ia/reset] Could not unregister SW:', err);
      }
    }
    return count;
  } catch (err) {
    console.error('[gen3ia/reset] getRegistrations failed:', err);
    return 0;
  }
}

/**
 * Vide TOUS les caches côté client (CacheStorage API).
 * Renvoie le nombre de caches supprimés.
 */
export async function clearAllCaches(): Promise<number> {
  if (typeof caches === 'undefined') {
    return 0;
  }
  try {
    const keys = await caches.keys();
    let count = 0;
    for (const key of keys) {
      try {
        const deleted = await caches.delete(key);
        if (deleted) {
          count++;
          console.log('[gen3ia/reset] Cache deleted:', key);
        }
      } catch (err) {
        console.warn('[gen3ia/reset] Could not delete cache:', key, err);
      }
    }
    return count;
  } catch (err) {
    console.error('[gen3ia/reset] caches.keys failed:', err);
    return 0;
  }
}

/**
 * Vide le localStorage et le sessionStorage des clés Gen3ia.
 * Préserve les clés tiers (ex: theme, analytics) pour ne pas casser l'UX.
 */
export function clearGen3iaStorage(): number {
  const GEN3IA_PREFIX = 'gen3ia';
  let count = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      const lsKeys = Object.keys(localStorage).filter((k) =>
        k.toLowerCase().includes(GEN3IA_PREFIX),
      );
      for (const k of lsKeys) {
        localStorage.removeItem(k);
        count++;
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      const ssKeys = Object.keys(sessionStorage).filter((k) =>
        k.toLowerCase().includes(GEN3IA_PREFIX),
      );
      for (const k of ssKeys) {
        sessionStorage.removeItem(k);
        count++;
      }
    }
  } catch (err) {
    console.warn('[gen3ia/reset] clearGen3iaStorage partial:', err);
  }
  return count;
}

/**
 * Hard reload : désinscrit les SW, vide les caches, recharge la page.
 * Le reload utilise `location.reload()` avec un bypass cache si supporté.
 *
 * @param opts.bypassCache — force le navigateur à re-valider auprès du serveur
 * @param opts.includeStorage — vide aussi localStorage/sessionStorage Gen3ia
 */
export async function hardReload(opts: {
  bypassCache?: boolean;
  includeStorage?: boolean;
} = {}): Promise<void> {
  const { bypassCache = true, includeStorage = false } = opts;

  console.log('[gen3ia/reset] Hard reload starting...', { bypassCache, includeStorage });

  // 1. Désinscrire les SW (en parallèle avec clear caches)
  const [swCount, cacheCount] = await Promise.all([
    unregisterAllServiceWorkers(),
    clearAllCaches(),
  ]);

  // 2. Vider le storage Gen3ia si demandé
  let storageCount = 0;
  if (includeStorage) {
    storageCount = clearGen3iaStorage();
  }

  console.log('[gen3ia/reset] Reset summary:', {
    serviceWorkers: swCount,
    caches: cacheCount,
    storageKeys: storageCount,
  });

  // 3. Recharger en bypassant le cache
  if (typeof window !== 'undefined') {
    if (bypassCache && 'caches' in window) {
      // Force le navigateur à re-valider auprès du serveur
      // (location.reload() sans paramètre fait un soft reload qui peut utiliser le cache)
      // Pour bypass, on ajoute un cache-buster à l'URL.
      const url = new URL(window.location.href);
      url.searchParams.set('_t', String(Date.now()));
      window.location.href = url.toString();
    } else {
      window.location.reload();
    }
  }
}

/**
 * Vérifie si le navigateur a un service worker actif et le signale.
 * Utilisé pour le debug.
 */
export async function diagnoseServiceWorker(): Promise<{
  hasSW: boolean;
  scope?: string;
  scriptURL?: string;
  count: number;
}> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { hasSW: false, count: 0 };
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) return { hasSW: false, count: 0 };
    const first = regs[0]!;
    return {
      hasSW: true,
      scope: first.scope,
      scriptURL: first.active?.scriptURL || first.installing?.scriptURL || first.waiting?.scriptURL,
      count: regs.length,
    };
  } catch {
    return { hasSW: false, count: 0 };
  }
}
