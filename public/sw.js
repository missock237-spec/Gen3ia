// ============================================================
// Gen3ia — Service Worker v6
// ============================================================
//  STRATÉGIE : Network-first pour TOUT (sauf assets hashés Next.js).
//
//  v6 — CORRECTION CRITIQUE :
//  - Le SW précédent (v5) utilisait cache-first pour les JS avec
//    un TTL de 24h et une CACHE_VERSION codée en dur. Résultat :
//    les utilisateurs restaient bloqués sur l'ancien code cassé.
//
//  - v6 passe à network-first pour les JS aussi. Les fichiers
//    Next.js sont déjà hashés par contenu (_next/static/chunks/XXX.js),
//    donc le cache HTTP du CDN/CDN de Vercel gère le cache optimal.
//    Le SW n'a pas besoin de doubler ce cache.
//
//  - ACTIVATE supprime TOUS les anciens caches (pas seulement
//    ceux d'une autre version) pour garantir un état propre.
//
//  - skipWaiting() est appelé immédiatement à l'installation
//    pour que le nouveau SW prenne le contrôle sans attendre
//    que l'utilisateur ferme tous les onglets.
// ============================================================

const CACHE_VERSION = 'gen3ia-v6';
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Assets publics à pré-cacher
const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

// --- INSTALL : skipWaiting immédiat + pré-cache ---
self.addEventListener('install', (event) => {
  // Skip waiting pour activer immédiatement le nouveau SW
  // sans attendre que l'utilisateur ferme les onglets
  self.skipWaiting();

  event.waitUntil(
    caches.open(DYNAMIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {})
    )
  );
});

// --- ACTIVATE : supprimer TOUS les anciens caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // Supprimer TOUS les caches, y compris ceux de v5 et antérieurs
        keys.map((key) => {
          console.log('[SW v6] Deleting cache:', key);
          return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// --- Communication SW <-> Client ---
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'GET_SW_VERSION') {
    event.ports[0]?.postMessage({
      type: 'SW_VERSION',
      cacheVersion: CACHE_VERSION,
      state: self.serviceWorker?.state || 'unknown',
    });
    return;
  }
});

// --- FETCH : NETWORK-FIRST pour tout ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les non-GET
  if (request.method !== 'GET') return;
  // Ne pas intercepter WebSocket
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;
  // Ne pas intercepter les vérifications de version
  if (url.pathname === '/api/app-version') return;
  // Ne JAMAIS intercepter les routes d'auth
  if (url.pathname.startsWith('/api/auth/')) return;

  // Pour TOUT le reste : NETWORK-FIRST avec fallback cache
  // Cela inclut les JS Next.js — ils sont hashés par contenu,
  // donc le cache HTTP du CDN gère déjà le cache optimal.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        // Mettre en cache uniquement les réponses réussies
        if (response.ok) {
          const cache = await caches.open(DYNAMIC_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Hors-ligne : essayer le cache
        const cache = await caches.open(DYNAMIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        // Pour les navigations, essayer de servir la page racine en cache
        if (request.mode === 'navigate') {
          const rootCache = await cache.match('/');
          if (rootCache) return rootCache;
        }

        return new Response(
          JSON.stringify({ error: 'Vous êtes hors-ligne', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })()
  );
});

// --- BACKGROUND SYNC ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-agent-executions') {
    event.waitUntil(syncQueuedExecutions());
  }
});

async function syncQueuedExecutions() {
  try {
    const cache = await caches.open(`${CACHE_VERSION}-queue`);
    const keys = await cache.keys();
    for (const key of keys) {
      const response = await cache.match(key);
      if (!response) continue;
      try {
        const body = await response.json();
        const result = await fetch(key.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (result.ok) await cache.delete(key);
      } catch {}
    }
  } catch (err) {
    console.error('[SW] sync failed:', err);
  }
}

// --- PUSH ---
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : { title: 'Gen3ia', body: 'Notification' };
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      tag: payload.tag || 'gen3ia',
      data: payload.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
