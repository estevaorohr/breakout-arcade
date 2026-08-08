const CACHE_NAME = 'breakout-arcade-v2';
const CORE_ASSETS = [
  './',
  './breakout.html',
  './breakout.css',
  './breakout.js',
  './breakout-utils.js',
  './breakout-specials.js',
  './breakout-cowboy-render.js',
  './breakout-leaderboard.js',
  './breakout-draw-effects.js',
  './breakout-deceptive.js',
  './breakout-entities.js',
  './breakout-controls.js',
  './manifest.webmanifest',
  './cowboy-hat.png',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isCriticalAsset =
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style';

  if (isSameOrigin && isCriticalAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }

          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./breakout.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return response;
        })
        .catch(() => caches.match('./breakout.html'));
    })
  );
});
