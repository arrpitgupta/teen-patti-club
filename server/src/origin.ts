import type { Config } from './config';

/** Phones on the same Wi-Fi open the dev client at a private LAN address. */
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export function allowedOrigins(config: Config): string[] {
  return config.CLIENT_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * CLIENT_ORIGIN is always allowed. Outside production, any private-network origin is allowed
 * too, so the app can be tested on a phone over Wi-Fi without editing .env.
 */
export function isAllowedOrigin(origin: string | undefined, config: Config): boolean {
  if (!origin) return true; // same-origin requests, curl, health checks
  if (allowedOrigins(config).includes(origin)) return true;
  return config.NODE_ENV !== 'production' && PRIVATE_ORIGIN.test(origin);
}

export type OriginCallback = (err: Error | null, allow?: boolean) => void;

export function originChecker(config: Config) {
  return (origin: string | undefined, cb: OriginCallback) =>
    cb(null, isAllowedOrigin(origin, config));
}
