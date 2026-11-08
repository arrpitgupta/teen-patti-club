// Installable app (PWA): service worker registration, the install prompt, and wake lock.
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at startup. */
export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own "Install app" button
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  // Offline app shell. In development Vite serves modules directly; only production registers
  // here (push registers the same worker on demand).
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .catch(() => undefined);
    });
  }
  if (import.meta.env.PROD) watchForUpdates();
}

// ---------- New versions after a deploy ----------

let updateReady = false;
const updateListeners = new Set<() => void>();
const UPDATE_CHECK_MS = 30 * 60_000;
const MIN_GAP_MS = 60_000;

/** Screens where a reload would interrupt something (a game, practice, the tutorial). */
const busyRoute = () => /^\/(g|practice|tutorial)(\/|$)/.test(window.location.pathname);

const MAIN_SCRIPT = /\/assets\/index-[\w-]+\.js/;

/** Path of the app script this page is running, e.g. /assets/index-TelgretC.js. */
function runningScript(): string | null {
  for (const el of document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')) {
    const m = MAIN_SCRIPT.exec(new URL(el.src).pathname);
    if (m) return m[0];
  }
  return null;
}

/**
 * A tab can stay open for hours (a long game). When the app comes back to the foreground, and
 * every 30 minutes, compare our script with the one in the live index.html. After a deploy:
 * away from a table, reload by itself; at a table only offer "Reload" so nobody loses a turn.
 */
function watchForUpdates(): void {
  const mine = runningScript();
  if (!mine) return;
  let last = Date.now();
  const check = async () => {
    if (updateReady || !navigator.onLine) return;
    last = Date.now();
    try {
      const res = await fetch('/', { cache: 'no-store' });
      const live = MAIN_SCRIPT.exec(await res.text())?.[0];
      if (!res.ok || !live || live === mine) return;
      void navigator.serviceWorker?.getRegistration().then((r) => r?.update());
      if (busyRoute()) {
        updateReady = true;
        updateListeners.forEach((l) => l());
      } else {
        window.location.reload();
      }
    } catch {
      // offline: try again later
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > MIN_GAP_MS) void check();
  });
  setInterval(() => void check(), UPDATE_CHECK_MS);
}

/** True once a new version took over while you were at a table. */
export function useUpdateReady(): boolean {
  const [ready, setReady] = useState(updateReady);
  useEffect(() => {
    const l = () => setReady(true);
    updateListeners.add(l);
    return () => {
      updateListeners.delete(l);
    };
  }, []);
  return ready;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
  );
}

/** 'prompt': we can show the browser's install dialog. 'ios': show Share → Add to Home Screen. */
export function useInstall(): { mode: 'prompt' | 'ios' | null; install: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const mode = isStandalone() ? null : deferred ? 'prompt' : isIos() ? 'ios' : null;
  return {
    mode,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      deferred = null;
      notify();
    },
  };
}

/** Keep the screen on while `active` (e.g. at the table). Re-acquired after tab switches. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const request = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
        if (!alive) void lock.release();
      } catch {
        // denied (battery saver) or unsupported: the game works without it
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
