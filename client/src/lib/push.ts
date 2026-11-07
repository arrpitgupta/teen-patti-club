// "Your turn" web push. Needs a secure context (https or localhost), a service worker and the
// Push API. iPhone/iPad only allow it for apps added to the Home Screen (Phase 6 makes the
// app installable).
import { SERVER_URL } from './config';
import { send } from './socket';
import { getPrefs, savePrefs } from './storage';

export type PushSupport = 'ok' | 'unsupported' | 'needsInstall';

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  const ok =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  if (ok) return 'ok';
  return isIos() && !isStandalone() ? 'needsInstall' : 'unsupported';
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupport() === 'ok' ? Notification.permission : 'unsupported';
}

let keyPromise: Promise<string | null> | null = null;
function serverKey(): Promise<string | null> {
  keyPromise ??= fetch(`${SERVER_URL}/api/push/key`)
    .then(async (r) => (r.ok ? ((await r.json()) as { publicKey: string }).publicKey : null))
    .catch(() => null);
  return keyPromise;
}

/** Is push set up on the server? (cached) */
export async function pushAvailable(): Promise<boolean> {
  return pushSupport() === 'ok' && (await serverKey()) !== null;
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** Subscribe this device (permission must already be granted) and tell the game. */
export async function subscribeForGame(): Promise<boolean> {
  try {
    const key = await serverKey();
    if (!key || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const bytes = keyBytes(key);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, bytes)) {
      // The server's key changed (e.g. a dev restart): start over.
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const ack = await send('push:subscribe', { subscription: json });
    return ack.ok;
  } catch {
    return false;
  }
}

/** Ask for permission (after a tap), then subscribe. */
export async function enablePush(): Promise<NotificationPermission> {
  const perm = await Notification.requestPermission();
  savePrefs({ ...getPrefs(), pushAsked: true, pushOff: perm !== 'granted' });
  if (perm === 'granted') await subscribeForGame();
  return perm;
}

/** Stop pushes for this game on this device (keeps the browser subscription for others). */
export async function disablePush(): Promise<void> {
  savePrefs({ ...getPrefs(), pushOff: true });
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await send('push:unsubscribe', { endpoint: sub.endpoint });
  } catch {
    // ignore
  }
}

/** On entering a game: resubscribe silently if the player already said yes. */
export async function autoSubscribe(): Promise<void> {
  const prefs = getPrefs();
  if (prefs.pushOff || pushPermission() !== 'granted') return;
  await subscribeForGame();
}
