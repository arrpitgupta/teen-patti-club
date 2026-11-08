import { SERVER_URL } from './config';

export type Load<T> =
  | { state: 'loading' }
  | { state: 'notFound' }
  | { state: 'error'; message?: string }
  | { state: 'ok'; data: T };

/** JSON REST call to the game server. Throws ApiError with the server's message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: init.body !== undefined ? JSON.stringify(init.body) : null,
    signal: init.signal ?? null,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText);
  return json as T;
}

/** For a page load: 404 → notFound, anything else → error. */
export function loadFailed(e: unknown): Load<never> {
  if (e instanceof ApiError && e.status === 404) return { state: 'notFound' };
  return { state: 'error', ...(e instanceof ApiError ? { message: e.message } : {}) };
}
