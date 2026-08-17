// ============================================================
// Gen3ia — Service Worker v2
// ============================================================
//  Cache-first pour assets statiques (économise la data)
//  Network-first pour API (données fraîches si connecté)
//  Background sync pour les exécutions d'agents en attente
//
//  v2 — bump pour invalider les caches navigateur après le fix
//  auth store (T17) + middleware (T18). Les navigateurs qui ont
//  déjà le SW v1 en cache vont: charger le nouveau SW → activate
//  → supprimer les caches v1 → re-fetch les pages/API fraîches.
// ============================================================

const CACHE_VERSION = 'gen3ia-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets à cacher au démarrage
const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// --- INSTALL : pré-cacher les pages essentielles ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting(); // Mise à jour immédiate
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

// --- FETCH : stratégies de cache ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ignorer les WebSocket
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;

  // API : network-first avec fallback cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Mettre en cache si réponse valide
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Fallback : cache ou réponse offline JSON
          return caches.match(request).then(
            (cached) =>
              cached ||
              new Response(
                JSON.stringify({ error: 'Vous êtes hors-ligne', offline: true }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              )
          );
        })
    );
    return;
  }

  // Assets statiques : cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/) ||
    url.pathname === '/'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigation : network-first (pas cache-first) pour éviter de servir
  // une vieille version du HTML/index. Le fallback cache n'est utilisé
  // qu'en cas de panne réseau. Pour les assets /_next/static/* (qui sont
  // hashés par build), le cache-first reste sûr (cf. sw logic ci-dessus).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Si la réponse est OK, on met en cache pour fallback offline
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
  }
});

// --- BACKGROUND SYNC : exécutions d'agents en attente ---
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
      // Rejouer la requête
      const result = await fetch(key.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (result.ok) {
        await cache.delete(key);
      }
    }
  } catch (err) {
    console.error('[SW] sync failed:', err);
  }
}

// --- PUSH : notifications ---
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
