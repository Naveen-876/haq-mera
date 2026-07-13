const CACHE_NAME = 'haq-mera-v1';
const OFFLINE_URL = '/index.html';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Tiro+Telugu&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap'
];

// ── INSTALL: cache all static assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for static, network-first for API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — always network, never cache (live data)
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({
          error: 'offline',
          message: 'Internet లేదు. Online అయినప్పుడు మళ్ళీ try చేయండి.'
        }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Google Fonts — cache after first load
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Static files — cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// ── BACKGROUND SYNC: retry failed requests when back online ──
self.addEventListener('sync', event => {
  if (event.tag === 'scheme-search') {
    console.log('Background sync: retrying scheme search');
  }
});

// ── PUSH NOTIFICATIONS (for future renewal alerts) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'హక్ మేరా', {
      body: data.body || 'మీ scheme renewal గుర్తు చేస్తున్నాం!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'haq-mera-alert',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
