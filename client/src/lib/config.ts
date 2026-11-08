/**
 * Server URL: VITE_SERVER_URL when set (production), otherwise the same host the page was
 * opened from on port 4000, so a phone that opened http://192.168.x.x:5317 reaches the
 * server on the same machine.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  `${window.location.protocol}//${window.location.hostname}:4000`;

const isLocalhost = (host: string) => host === 'localhost' || host === '127.0.0.1';

/** Base URL to put in invite links and QR codes (must be reachable from other phones). */
export function shareOrigin(): string {
  if (isLocalhost(window.location.hostname) && __LAN_ORIGIN__) return __LAN_ORIGIN__;
  return window.location.origin;
}

export function joinUrl(code: string): string {
  return `${shareOrigin()}/join/${code}`;
}

/** True when the invite link would only work on this computer. */
export function inviteNeedsLan(): boolean {
  return isLocalhost(new URL(shareOrigin()).hostname);
}

export function resultsUrl(resultsId: string): string {
  return `${shareOrigin()}/r/${resultsId}`;
}

export function groupUrl(groupId: string): string {
  return `${shareOrigin()}/group/${groupId}`;
}

/**
 * Render's free plan stops the server after 15 minutes without HTTP traffic, and a waiting
 * table may send nothing for that long. While a game is open, ping /health every 5 minutes.
 */
export function startKeepAlive(): () => void {
  const ping = () => {
    if (document.visibilityState !== 'visible') return;
    void fetch(`${SERVER_URL}/health`, { cache: 'no-store' }).catch(() => undefined);
  };
  const timer = setInterval(ping, 5 * 60_000);
  return () => clearInterval(timer);
}
