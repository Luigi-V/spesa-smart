// Spesa Smart - Service Worker (v7)
const CACHE_NAME = 'spesa-smart-v8';

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css?v=8',
  './js/db.js?v=8',
  './js/app.js?v=8',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
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
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve(false))));
    await self.clients.claim();
  })());
});

function isHTML(req){
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // reset.html: non intercettare, lascia sempre rete
  if (url.origin === self.location.origin && url.pathname.endsWith('/reset.html')) return;

  const sameOrigin = (url.origin === self.location.origin);
  const isCodeAsset = sameOrigin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'));

  // network-first for HTML/JS/CSS
  if (isHTML(req) || isCodeAsset){
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try{
        const fresh = await fetch(new Request(req, { cache: 'reload' }));
        await cache.put(req, fresh.clone());
        return fresh;
      }catch(e){
        const cached = await cache.match(req, { ignoreSearch:false }) || await cache.match(req, { ignoreSearch:true });
        if (cached) return cached;
        // fallback offline to app shell
        const shell = await cache.match('./index.html');
        if (shell) return shell;
        throw e;
      }
    })());
    return;
  }

  // cache-first for images
  const isImage = sameOrigin && (url.pathname.includes('/icons/') || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i));
  if (isImage){
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch:true });
      if (cached) return cached;
      const fresh = await fetch(req);
      await cache.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }
  // default: pass-through
});
