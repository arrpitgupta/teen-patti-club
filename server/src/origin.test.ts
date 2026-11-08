import { describe, expect, it } from 'vitest';
import { loadConfig, productionWarnings } from './config';
import { isAllowedOrigin } from './origin';

const dev = loadConfig({ NODE_ENV: 'development', CLIENT_ORIGIN: 'http://localhost:5317' });
const prod = loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://tpc.vercel.app' });

describe('allowed origins', () => {
  it('always allows CLIENT_ORIGIN', () => {
    expect(isAllowedOrigin('http://localhost:5317', dev)).toBe(true);
    expect(isAllowedOrigin('https://tpc.vercel.app', prod)).toBe(true);
  });

  it('allows phones on the local network in development', () => {
    expect(isAllowedOrigin('http://192.168.1.48:5317', dev)).toBe(true);
    expect(isAllowedOrigin('http://10.0.0.7:5317', dev)).toBe(true);
    expect(isAllowedOrigin('http://172.20.1.2:5317', dev)).toBe(true);
  });

  it('never allows other origins, and no LAN origins in production', () => {
    expect(isAllowedOrigin('https://evil.example.com', dev)).toBe(false);
    expect(isAllowedOrigin('http://192.168.1.48:5317', prod)).toBe(false);
    expect(isAllowedOrigin('http://172.40.1.2:5317', dev)).toBe(false);
  });
});

describe('production config', () => {
  it('accepts CLIENT_ORIGIN with a trailing slash or several origins', () => {
    const c = loadConfig({
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://tpc.vercel.app/, https://cards.example.com',
    });
    expect(isAllowedOrigin('https://tpc.vercel.app', c)).toBe(true);
    expect(isAllowedOrigin('https://cards.example.com', c)).toBe(true);
    expect(isAllowedOrigin('https://tpc-git-branch.vercel.app', c)).toBe(false);
  });

  it('warns about a non-https origin and a missing push contact', () => {
    const warnings = productionWarnings(
      loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'http://localhost:5317' }),
    );
    expect(warnings.join('\n')).toMatch(/https/);
    const noContact = productionWarnings(
      loadConfig({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://tpc.vercel.app',
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
      }),
    );
    expect(noContact.join('\n')).toMatch(/VAPID_SUBJECT/);
    const ok = loadConfig({
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://tpc.vercel.app',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:someone@example.com',
    });
    expect(productionWarnings(ok)).toEqual([]);
    expect(productionWarnings(dev)).toEqual([]);
  });
});
