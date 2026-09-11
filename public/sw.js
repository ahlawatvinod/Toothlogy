/*
 * TOOTHLOGY SERVICE WORKER
 *
 * Deliberately conservative, because this is a health product:
 *
 * - NO page or API response is cached. A cached appointment list or record on
 *   a shared family phone is a privacy incident, and a stale booking page is a
 *   double-booking waiting to happen. Pages always come from the network.
 * - When the network is unavailable, a navigation falls back to /offline,
 *   which is precached and contains no personal data.
 * - Build assets under /_next/static are content-hashed and immutable, so they
 *   are cached cache-first; this is what makes repeat visits fast.
 * - Push messages are shown as they arrive. The server sends only a generic
 *   title and a link — never clinical detail — because push previews appear
 *   on lock screens.
 *
 * Bump VERSION to invalidate every cache on the next activation.
 */

const VERSION = 'tl-sw-v1';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/pwa-icons/192', '/pwa-icons/512'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa-icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
  // Everything else — pages, /api — goes to the network untouched.
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Toothlogy', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Toothlogy', {
      body: data.body || '',
      icon: '/pwa-icons/192',
      badge: '/pwa-icons/192',
      data: { url: typeof data.url === 'string' ? data.url : '/account/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  // Only ever open our own origin, whatever the payload says.
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(target.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
