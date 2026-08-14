const CACHE_NAME = 'todo-pwa-v45';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=1.3.0',
  './script.js?v=1.6.0',
  './vendor/sortable.min.js',
  './manifest.json?v=1.0.1',
  './assets/quick-lists/quick-market.jpg',
  './assets/quick-lists/quick-pharmacy.jpg',
  './assets/quick-lists/quick-pet.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isFreshAsset = request.mode === 'navigate' || ['.html', '.js', '.css'].some((ext) => url.pathname.endsWith(ext));
  if (isFreshAsset) {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
