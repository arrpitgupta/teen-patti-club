import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AppHandles } from './app';
import { loadConfig } from './config';

describe('GET /health', () => {
  let handles: AppHandles;
  let baseUrl: string;

  beforeAll(async () => {
    handles = createApp(loadConfig({ NODE_ENV: 'test' }));
    await new Promise<void>((resolve) => handles.httpServer.listen(0, resolve));
    const { port } = handles.httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => handles.io.close(() => resolve()));
  });

  it('returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
