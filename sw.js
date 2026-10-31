const CACHE_NAME = 'qr-studio-v7'; // نسخه آپدیت شد

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
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(LOCAL_ASSETS);

      // استفاده از Promise.allSettled برای اینکه اگر اینترنت قطع بود، نصب کل پروژه لغو نشود
      await Promise.allSettled(
        EXTERNAL_ASSETS.map(async (url) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(url, {
              mode: 'cors',
              credentials: 'omit',
              signal: controller.signal
            }).finally(() => clearTimeout(timeout));

            if (response && (response.ok || response.type === 'opaque')) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('Failed to cache external asset:', url);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  const url = new URL(req.url);
  const isHtml = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';

  // Network-First برای HTML
  if (isHtml) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html', { ignoreSearch: true });
        }
      })()
    );
    return;
  }

  // Cache-First برای فونت‌ها و اسکریپت‌ها
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(req, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(req);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        return new Response('', { status: 408, statusText: 'Offline' });
      }
    })()
  );
});