const CACHE_NAME = 'pdv-pro-v4';
const APP_SHELL = ['/', '/index.html', '/manifest.json'];

// Instala o Service Worker e guarda os arquivos no Cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// Remove versões antigas do cache depois de uma atualização.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});

// Intercepta as requisições para o app funcionar offline
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(networkResponse => {
        if (networkResponse.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return networkResponse;
      });
    })
  );
});
