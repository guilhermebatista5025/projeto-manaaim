/**
 * PDV Pro — Service Worker
 * Estratégia: Cache-first para assets estáticos, dados via localStorage
 */

const CACHE_NAME = 'pdvpro-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
];

// Instalação: pré-cacheia todos os assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Tenta cachear tudo; falhas em recursos externos são silenciosas
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// Ativação: limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first para assets locais, network-first para externos
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições não GET
  if (event.request.method !== 'GET') return;

  // Estratégia: Cache-first com fallback para rede
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Só cacheia respostas válidas
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback para navegação
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
