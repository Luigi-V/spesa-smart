// Spesa Smart - Service Worker
// v6: update-safe caching for GitHub Pages + network-first for navigations/assets
const CACHE_NAME = 'spesa-smart-v6';

// NB: usare gli stessi URL presenti in index.html (con ?v=6) per evitare servire asset vecchi
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css?v=6',
  './js/db.js?v=6',
  './js/app.js?v=6',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Forza il reload bypassando cache HTTP (GH Pages può servire risposte cache-ate)
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      const req = new Request(url, { cache: 'reload' });
      const res = await fetch(req);
      await cache.put(url, res);
    }));
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  const isSameOrigin = (url.origin === self.location.origin);
  const isNav = req.mode === 'navigate';
  const isCodeAsset = isSameOrigin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'));
  const isImage = isSameOrigin && (url.pathname.startsWith('/icons/') || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i));

  // Network-first for navigations and code assets
  if (isNav || isCodeAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        // cache without search for app shell? keep full req url to respect ?v=
        await cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await cache.match(req, { ignoreSearch: false }) || await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        // fallback to app shell for navigations
        if (isNav) {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw e;
      }
    })());
    return;
  }

  // Cache-first for images/icons
  if (isImage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const fresh = await fetch(req);
      await cache.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  // Default: pass-through
});
