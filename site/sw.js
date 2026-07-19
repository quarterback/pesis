/* Mallo service worker — app-shell cache + offline, with fresh-data preference.
   Bump CACHE to invalidate on shell changes. */
const CACHE = 'mallo-v2';
const SHELL = [
  '/', '/index.html',
  '/css/mallo.css', '/css/charts.css',
  '/js/app.js', '/js/charts.js', '/js/primer.js', '/js/theme-toggle.js', '/js/d3.v7.min.js',
  '/favicon.ico', '/mallo.svg', '/icon-192.png', '/icon-512.png', '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // fonts etc. → straight to network

  // SPA navigations always resolve to the cached shell (hash routing does the rest)
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('/index.html').then((r) => r || fetch(req)));
    return;
  }

  // Data JSON: network-first (fresh stats), fall back to cache when offline
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }))
  );
});
