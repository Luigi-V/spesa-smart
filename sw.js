// Spesa Smart - Service Worker (cache-first con fallback rete)
const CACHE_NAME = 'spesa-smart-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try{
      const fresh = await fetch(req);
      // cache same-origin only
      const url = new URL(req.url);
      if (url.origin === self.location.origin){
        cache.put(req, fresh.clone());
      }
      return fresh;
    }catch(e){
      // fallback to app shell for navigations
      if (req.mode === 'navigate'){
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
