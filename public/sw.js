// Service Worker para PWA
'use strict';

const CACHE_NAME = 'todo-app-v3';
const RUNTIME_CACHE = 'todo-runtime-v3';

// Arquivos para cachear na instalação (apenas arquivos locais)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/list.html',
  '/detail.html',
  '/js/main.js',
  '/js/list.js',
  '/js/detail.js',
  '/js/api.js',
  '/js/socket.js',
  '/js/device.js',
  '/manifest.json'
];

// Instalação - cachear arquivos estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação - limpar caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - estratégia de cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Apenas cachear requisições do mesmo origin
  if (url.origin !== location.origin) {
    return;
  }
  
  // Estratégia para diferentes tipos de requisições
  if (request.url.includes('/api/')) {
    // API: Network First, fallback para cache
    event.respondWith(networkFirst(request));
  } else if (request.url.includes('/api/photos/')) {
    // Fotos: Cache First
    event.respondWith(cacheFirst(request));
  } else {
    // Arquivos estáticos: Cache First, fallback para network
    event.respondWith(cacheFirst(request));
  }
});

// Network First - para API
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cachear resposta se foi bem-sucedida
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network request failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Se não tem cache, retornar erro
    return new Response('Offline - sem cache disponível', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache First - para arquivos estáticos e fotos
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Serving from cache:', request.url);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Cachear resposta se foi bem-sucedida
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Failed to fetch:', request.url);
    
    // Fallback para páginas HTML
    if (request.destination === 'document') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('/index.html');
    }
    
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Mensagens do cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

