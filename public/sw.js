// ============================================================
// Gen3ia — Service Worker v4
// ============================================================
//  Cache-first pour assets statiques HASHÉS (/_next/static/*)
//  Network-first pour navigation HTML et API
//  TTL: 24h static, 5min API
//  Background sync pour les exécutions d'agents en attente
//  NOTIFICATION de mise à jour via postMessage au client
//
//  v4 — ajoute le canal de communication SW <-> client pour
//  l'auto-update. Quand un nouveau SW est installé, il notifie
//  toutes les tabs ouvertes via postMessage({ type: 'SW_UPDATE_AVAILABLE' }).
//  Le client peut alors afficher une bannière "Mise à jour disponible".
//
//  La CACHE_VERSION est dynamiquement injectée par prebuild.js
//  à chaque build (gen3ia-v<version>-<gitSha>), garantissant que
//  chaque déploiement invalide les anciens caches.
// ============================================================

const CACHE_VERSION = 'gen3ia-v3'; // Sera remplacé par prebuild.js
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_TTL_MS = 24 * 60 * 60 * 1000;
const API_TTL_MS = 5 * 60 * 1000;

const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

// --- INSTALL : pré-cacher + notifier les clients ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  // NE PAS appeler skipWaiting() ici — laisser le client décider
  // quand activer le nouveau SW via la bannière de mise à jour.
});

// --- ACTIVATE : nettoyer les vieux caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// --- Communication SW <-> Client ---
// Quand le client demande d'activer le nouveau SW en attente
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Le client demande les infos de version du SW
  if (event.data?.type === 'GET_SW_VERSION') {
    event.ports[0]?.postMessage({
      type: 'SW_VERSION',
      cacheVersion: CACHE_VERSION,
      state: self.serviceWorker?.state || 'unknown',
    });
    return;
  }
});

// --- Helpers : cache avec TTL ---
async function getCachedWithTtl(cache, request, ttlMs) {
  const cached = await cache.match(request);
  if (!cached) return null;
  const cachedAt = cached.headers.get('x-sw-cached-at');
  if (cachedAt) {
    const age = Date.now() - parseInt(cachedAt, 10);
    if (age > ttlMs) {
      await cache.delete(request);
      return null;
    }
  }
  return cached;
}

async function putWithTimestamp(cache, request, response) {
  const clone = response.clone();
  const headers = new Headers(clone.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  const cachedResponse = new Response(clone.body, { status: clone.status, statusText: clone.statusText, headers });
  await cache.put(request, cachedResponse);
}

// Notifier toutes les tabs qu'une mise à jour est disponible
function notifyClientsUpdateAvailable() {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({
        type: 'SW_UPDATE_AVAILABLE',
        cacheVersion: CACHE_VERSION,
      });
    }
  });
}

// --- FETCH : stratégies de cache ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;

  // Ne pas intercepter la requête de version (toujours fraîche)
  if (url.pathname === '/api/app-version') return;

  // API : network-first avec fallback cache TTL
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(API_CACHE);
            await putWithTimestamp(cache, request, response);
          }
          return response;
        } catch (err) {
          const cache = await caches.open(API_CACHE);
          const cached = await getCachedWithTtl(cache, request, API_TTL_MS);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: 'Vous êtes hors-ligne', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }

  // Assets statiques Next.js HASHÉS : cache-first
  if (url.pathname.match(/\/\_next\/static\/.*\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await getCachedWithTtl(cache, request, STATIC_TTL_MS);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) await putWithTimestamp(cache, request, response);
          return response;
        } catch (err) {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Assets publics : cache-first avec TTL
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/) && !url.pathname.startsWith('/_next/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await getCachedWithTtl(cache, request, STATIC_TTL_MS);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) await putWithTimestamp(cache, request, response);
          return response;
        } catch (err) {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Navigations HTML : NETWORK-FIRST
  if (request.method === 'GET') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && request.mode === 'navigate') {
            const cache = await caches.open(STATIC_CACHE);
            await putWithTimestamp(cache, request, response);
          }
          return response;
        } catch (err) {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await getCachedWithTtl(cache, request, STATIC_TTL_MS);
          if (cached) return cached;
          const rootCache = await cache.match('/');
          if (rootCache) return rootCache;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } });
        }
      })()
    );
  }
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
      const body = await response.json();
      const result = await fetch(key.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (result.ok) await cache.delete(key);
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
