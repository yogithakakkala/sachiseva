// TO UPDATE SCHEME DATA: 1) edit schemes.json 2) bump CACHE_VERSION below 3) redeploy
const CACHE_VERSION = 'sachiseva-v3';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js',
  './schemes.json',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
