/* Spesa Smart service worker v4 */
const VERSION = 4;
const CACHE_NAME = `spesa-smart-v${VERSION}`;
const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  './css/style.css?v=5',
  './js/app.js?v=5',
  './manifest.webmanifest',
  './reset.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k === CACHE_NAME) return Promise.resolve();
      if (!k.startsWith('spesa-smart-')) return Promise.resolve();
      return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

const isNavigation = (req) => req.mode === 'navigate' || (req.destination === 'document');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const dest = req.destination;

  // Icons & manifest: cache first
  if (dest === 'image' || url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // HTML/JS/CSS: network first, fallback to cache when offline
  if (dest === 'document' || dest === 'script' || dest === 'style' || isNavigation(req) || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (isNavigation(req)) {
          const fallback = await cache.match('./index.html',
  './sw.js', { ignoreSearch: true });
          if (fallback) return fallback;
        }
        throw e;
      }
    })());
    return;
  }

  // default: cache first, then network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  })());
});
