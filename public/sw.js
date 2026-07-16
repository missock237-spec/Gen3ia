// ============================================================
// Genova AI — Service Worker
// Permet le mode hors-ligne partiel et les notifications push
// ============================================================

const CACHE_NAME = 'genova-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/favicon-genova.png',
  '/icon.svg',
  '/site.webmanifest',
  '/og-image.png',
];

// Installation : pré-charger les assets statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activer le nouveau service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Intercepter les requêtes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les API (toujours frais)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cache-first pour les assets statiques
  if (
    request.method === 'GET' &&
    (url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/) ||
      STATIC_ASSETS.includes(url.pathname))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
  }
});

// Gérer les notifications push
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {
    title: 'Genova AI',
    body: 'Vous avez une notification',
    icon: '/favicon-genova.png',
  };

  const options = {
    body: data.body,
    icon: data.icon || '/favicon-genova.png',
    badge: '/favicon-genova.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Ouvrir la page au clic sur notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
