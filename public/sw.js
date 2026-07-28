// ============================================================
// Gen3ia — Service Worker v2
// Stratégie : Network First, cache fallback
// Cache : statique (navigation) + dynamique (API)
// ============================================================
const CACHE_STATIC = 'gen3ia-static-v2';
const CACHE_DYNAMIC = 'gen3ia-dynamic-v2';
const CACHE_IMMUTABLE = 'gen3ia-immutable-v2';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/favicon-gen3ia.png',
];

const API_CACHE_STRATEGIES = {
  '/api/health': 'cache-first',
  '/api/events': 'network-only',
};

// === INSTALL ===
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// === ACTIVATE ===
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('genova-') || (k.startsWith('gen3ia-') && k !== CACHE_STATIC && k !== CACHE_DYNAMIC && k !== CACHE_IMMUTABLE))
          .map((k) => caches.delete(k))
      );
    })
  );
  return self.clients.claim();
});

// === FETCH ===
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API — Stratégie spécifique
  const strategy = Object.entries(API_CACHE_STRATEGIES).find(([path]) =>
    url.pathname.startsWith(path)
  )?.[1];

  if (strategy === 'cache-first') {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  if (strategy === 'network-only') {
    e.respondWith(networkOnly(e.request));
    return;
  }

  // Pages et assets — Network First
  if (url.origin === self.location.origin) {
    if (
      url.pathname === '/' ||
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/register') ||
      url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/agents') ||
      url.pathname.startsWith('/settings') ||
      url.pathname.startsWith('/terminal')
    ) {
      e.respondWith(networkFirst(e.request, CACHE_STATIC));
      return;
    }

    // Assets statiques — Cache First
    if (
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$/)
    ) {
      e.respondWith(cacheFirst(e.request));
      return;
    }

    // API GET — Network First avec cache
    if (url.pathname.startsWith('/api/') && e.request.method === 'GET') {
      e.respondWith(networkFirst(e.request, CACHE_DYNAMIC));
      return;
    }
  }
});

// === STRATÉGIES ===
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback vers la page d'accueil
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_IMMUTABLE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

async function networkOnly(request) {
  return fetch(request);
}
