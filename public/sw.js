const CACHE_NAME = 'doodh-wallah-v1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.url.includes('/api/') || 
      event.request.url.includes('supabase') ||
      event.request.url.includes('googleapis')) {
    return;
  }

  const isNavigationRequest = event.request.mode === 'navigate';
  const isAssetRequest = event.request.destination === 'script' || 
                          event.request.destination === 'style' ||
                          event.request.destination === 'image' ||
                          event.request.destination === 'font';

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, responseClone);
        }
        
        return networkResponse;
      } catch (error) {
        const cachedResponse = await caches.match(event.request);
        
        if (cachedResponse) {
          return cachedResponse;
        }
        
        if (isNavigationRequest) {
          const fallback = await caches.match('/');
          if (fallback) {
            return fallback;
          }
        }
        
        return new Response('Offline', { 
          status: 503, 
          statusText: 'Service Unavailable' 
        });
      }
    })()
  );
});
