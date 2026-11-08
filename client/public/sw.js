/* global self, URL, caches, fetch, Response */
/* Teen Patti Club service worker:
 * - offline app shell (the app opens without a connection; practice and the tutorial work offline)
 * - "your turn" notifications (web push)
 * The game server (another origin) is never cached. */

const SHELL = 'tpc-shell-v2';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isHtml = (res) => (res.headers.get('content-type') ?? '').includes('text/html');

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Never keep a page (e.g. an SPA fallback) under a script or style URL.
  if (res.ok && !isHtml(res)) (await caches.open(SHELL)).put(req, res.clone());
  return res;
}

/** After a deploy: drop built files that the current page no longer uses. */
async function pruneAssets(html) {
  const used = new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? []);
  if (used.size === 0) return;
  const cache = await caches.open(SHELL);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !used.has(path)) await cache.delete(req);
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit ?? update;
}

async function networkFirstPage(req) {
  try {
    const res = await fetch(req);
    if (res.ok && isHtml(res)) {
      (await caches.open(SHELL)).put('/', res.clone());
      res
        .clone()
        .text()
        .then(pruneAssets)
        .catch(() => undefined);
    }
    return res;
  } catch {
    return (await caches.match('/')) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    // Every route is the single-page app.
    event.respondWith(networkFirstPage(req));
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    // Built files have content hashes: safe to cache forever.
    event.respondWith(cacheFirst(req));
  } else if (
    (url.origin === self.location.origin &&
      (url.pathname.startsWith('/icons/') ||
        url.pathname === '/favicon.svg' ||
        url.pathname === '/manifest.webmanifest')) ||
    FONT_HOSTS.includes(url.hostname)
  ) {
    event.respondWith(staleWhileRevalidate(req));
  }
  // Everything else (the game server, dev modules) goes straight to the network.
});

// ---------- "Your turn" notifications ----------

self.addEventListener('push', (event) => {
  let msg = { title: 'Teen Patti Club', body: 'It’s your turn.', tag: 'tpc', url: '/' };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    // keep the default text
  }
  event.waitUntil(
    (async () => {
      // If the app is open and on screen, the table already shows it: no notification.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === 'visible' && w.focused !== false)) return;
      await self.registration.showNotification(msg.title, {
        body: msg.body,
        tag: msg.tag,
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [60, 60, 60],
        data: { url: msg.url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if (w.url === url && 'focus' in w) return w.focus();
      }
      const first = windows[0];
      if (first && 'navigate' in first) {
        await first.navigate(url);
        return first.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
