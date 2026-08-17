// ============================================================
// Gen3ia — Service Worker v3
// ============================================================
//  Cache-first pour assets statiques HASHÉS (/_next/static/*)
//  Network-first pour navigation HTML ET fetch('/') (données fraîches)
//  Network-first pour API (données fraîches si connecté)
//  Background sync pour les exécutions d'agents en attente
//  TTL: 24h pour static, 5min pour API — évite le cache "indéfiniment"
//
//  v3 — fixe le bug v2 où '/' était traité comme un asset statique
//  (cache-first) au lieu d'une navigation (network-first). Cela
//  signifiait qu'après la première visite, le HTML de '/' était
//  servi depuis le cache sans jamais repasser par le serveur —
//  le "T17 fix" n'était jamais livré aux utilisateurs ayant SW v2.
//  v3 supprime les caches v2 et applique network-first sur toutes
//  les navigations et fetch('/') explicites.
// ============================================================

const CACHE_VERSION = 'gen3ia-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// TTL en millisecondes
const STATIC_TTL_MS = 24 * 60 * 60 * 1000; // 24h pour assets statiques
const API_TTL_MS = 5 * 60 * 1000;           // 5min pour API (offline fallback)

// Assets à pré-cacher au démarrage (uniquement ceux qui sont stables)
const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

// --- INSTALL : pré-cacher les assets essentiels (pas le HTML) ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting(); // Mise à jour immédiate
});

// --- ACTIVATE : nettoyer les vieux caches (v1, v2, ...) ---
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

// --- Helpers : cache avec TTL ---
async function getCachedWithTtl(cache, request, ttlMs) {
  const cached = await cache.match(request);
  if (!cached) return null;
  // Lire la date de mise en cache depuis l'en-tête ajouté
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
  // Cloner et ajouter un en-tête de date pour le TTL
  const clone = response.clone();
  const headers = new Headers(clone.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  const cachedResponse = new Response(clone.body, { status: clone.status, statusText: clone.statusText, headers });
  await cache.put(request, cachedResponse);
}

// --- FETCH : stratégies de cache ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ignorer les WebSocket
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;

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
          // Fallback : cache (si pas expiré) ou réponse offline
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

  // Assets statiques Next.js HASHÉS : cache-first (sûr car le hash change à chaque build)
  // IMPORTANT : on ne match PAS '/' ici — c'est du HTML, pas un asset statique.
  if (url.pathname.match(/\/_next\/static\/.*\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await getCachedWithTtl(cache, request, STATIC_TTL_MS);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            await putWithTimestamp(cache, request, response);
          }
          return response;
        } catch (err) {
          // Pas de fallback offline pour les assets non-cached — l'app ne peut pas fonctionner
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Assets publics (favicon, icon.svg, manifest) : cache-first avec TTL
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/) && !url.pathname.startsWith('/_next/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await getCachedWithTtl(cache, request, STATIC_TTL_MS);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            await putWithTimestamp(cache, request, response);
          }
          return response;
        } catch (err) {
          return new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Toutes les autres requêtes GET (navigations HTML, fetch('/'), fetch('/login'), ...) :
  // NETWORK-FIRST. Le navigateur repasse toujours par le serveur pour obtenir
  // la dernière version du HTML — fallback cache UNIQUEMENT en cas de panne réseau.
  if (request.method === 'GET') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && request.mode === 'navigate') {
            // Mettre en cache le HTML pour fallback offline
            const cache = await caches.open(STATIC_CACHE);
            await putWithTimestamp(cache, request, response);
          }
          return response;
        } catch (err) {
          // Fallback : cache HTML (si pas expiré) ou racine
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
