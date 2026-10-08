const CACHE_NAME = 'qr-studio-v5';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/qr-code-styling@1.5.0/lib/qr-code-styling.js',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap'
];

// Keep installation independent of optional third-party CDN availability.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // These same-origin files are required; a failure here should fail installation.
    await cache.addAll(LOCAL_ASSETS);

    // Cache CDN resources one-by-one with a bounded timeout. Any external failure
    // is non-fatal, so the worker can still install and activate reliably.
    await Promise.all(EXTERNAL_ASSETS.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(url, { mode: 'cors', signal: controller.signal });
          if (response && response.ok) await cache.put(url, response);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        // Optional CDN resource unavailable; continue installing.
      }
    }));
    await self.skipWaiting();
  })());
});

// Remove prior worker caches after the v5 cache has been created.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())
    )).then(() => self.clients.claim())
  );
});

// Network-First for HTML to propagate UI updates, Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const isHtml = event.request.mode === 'navigate' || event.request.url.includes('index.html');

  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Cache-First for assets and external scripts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache)).catch(() => {});
        return networkResponse;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
