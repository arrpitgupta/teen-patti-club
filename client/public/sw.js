/* global self, URL */
/* Teen Patti Club service worker: "your turn" notifications.
 * Phase 6 (PWA) extends this file with the offline app shell. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
        icon: '/favicon.svg',
        badge: '/favicon.svg',
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
