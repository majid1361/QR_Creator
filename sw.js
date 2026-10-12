const CACHE_NAME = 'qr-studio-v6';

// فایل‌های الزامی ریشه و پروژه
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// اسکریپت‌ها و منابع خارجی حیاتی برای عملکرد آفلاین
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/qr-code-styling@1.5.0/lib/qr-code-styling.js',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap'
];

// ۱. مرحله Install: تضمین لود شدن استاتیک‌ها بدون گیر کردن روی CDNهای کند یا فیلتر
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // فایل‌های محلی اجباری هستند
      await cache.addAll(LOCAL_ASSETS);

      // فایل‌های CDN اختیاری کَش می‌شوند تا اینستال لنگ نماند
      await Promise.allSettled(
        EXTERNAL_ASSETS.map(async (url) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            
            // درخواست با مود cors/no-cors هوشمند برای گرفتن فونت و CDNها
            const response = await fetch(url, {
              mode: 'cors',
              credentials: 'omit',
              signal: controller.signal
            }).finally(() => clearTimeout(timeout));

            if (response && (response.ok || response.type === 'opaque')) {
              await cache.put(url, response);
            }
          } catch (err) {
            // در صورت قطعی اینترنت در اولین اینستال، نصب لغو نمی‌شود
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// ۲. مرحله Activate: پاکسازی اتوماتیک کش‌های قدیمی (v5 و قبل از آن)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// ۳. مرحله Fetch: مدیریت درخواست‌ها بر اساس نوع منبع
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // فقط درخواست‌های GET هندل شوند (جلوگیری از خطای افزونه‌ها و متدهای POST)
  if (req.method !== 'GET') return;

  // فیلتر کردن پروتکل‌های متفرقه مثل chrome-extension
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);
  const isHtml = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';

  // استراتژی Network-First برای HTML (همیشه آخرین آپدیت لود شود اما در آفلاین بالا بیاید)
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
          // در صورت آفلاین بودن، از کش می‌خواند
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html', { ignoreSearch: true });
        }
      })()
    );
    return;
  }

  // استراتژی Stale-While-Revalidate / Cache-First برای فونت‌ها و اسکریپت‌ها
  event.respondWith(
    (async () => {
      // اول کش چک شود
      const cachedResponse = await caches.match(req, { ignoreSearch: true });
      if (cachedResponse) {
        return cachedResponse;
      }

      // در صورت نبودن در کش، دانلود شده و ذخیره شود (از جمله فونت‌های woff2 گوگل)
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // برای دارایی‌هایی مثل فونت/عکس، برگرداندن HTML اشتباه است؛ پاسخ خالی یا خطا بدهد
        return new Response('', { status: 408, statusText: 'Resource Unavailable Offline' });
      }
    })()
  );
});
