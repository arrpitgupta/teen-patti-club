import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from './util/crypto';
import { redact, registerSecret } from './util/log';
import {
  digital,
  setupTable,
  startTestServer,
  syncAll,
  TestClient,
  until,
  type TestServer,
} from './test/helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer({ sockets: { rateCapacity: 10, ratePerSec: 5 } });
});
afterAll(async () => {
  await srv.stop();
});

const code = async (c: TestClient, name: string, payload?: unknown) => {
  const ack = await c.call(name, payload);
  return ack.ok ? 'OK' : ack.error.code;
};

describe('validation and permissions', () => {
  it('rejects bad payloads, unknown games, bad tokens and actions before joining', async () => {
    const c = new TestClient(srv.url, 'Solo');
    await c.connected();
    expect(await code(c, 'action:pack')).toBe('NOT_IN_GAME');
    expect(await code(c, 'game:join', { code: 'ZZZZZZ', name: 'X', avatar: '🙂' })).toBe(
      'GAME_NOT_FOUND',
    );
    expect(await code(c, 'game:join', { code: 'nope', name: 'X', avatar: '🙂' })).toBe(
      'INVALID_PAYLOAD',
    );
    expect(await code(c, 'game:create', { name: '', avatar: '🙂', settings: digital() })).toBe(
      'INVALID_PAYLOAD',
    );
    await c.create();
    expect(await code(c, 'action:chaal', { amount: 'lots' })).toBe('INVALID_PAYLOAD');
    expect(await code(c, 'action:chaal', { amount: 10, extra: 1 })).toBe('INVALID_PAYLOAD');
    const other = new TestClient(srv.url, 'Other');
    await other.connected();
    expect(await code(other, 'game:reconnect', { code: c.code, playerToken: 'x'.repeat(32) })).toBe(
      'BAD_TOKEN',
    );
    c.close();
    other.close();
  });

  it('host-only actions are refused for other players; engine errors come back in plain English', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    expect(await code(a, 'game:start')).toBe('NOT_HOST');
    expect(await code(a, 'action:pack')).toBe('GAME_NOT_STARTED');
    await host.must('game:start');
    for (const name of ['round:start', 'game:end', 'host:pause']) {
      expect(await code(a, name, name === 'host:pause' ? { paused: true } : {})).toBe('NOT_HOST');
    }
    expect(await code(a, 'host:kick', { playerId: b.playerId })).toBe('NOT_HOST');
    const ack = await b.call('action:pack');
    expect(ack).toEqual({
      ok: false,
      error: { code: 'NOT_YOUR_TURN', message: "It's not your turn." },
    });
    expect(await code(a, 'action:chaal', { amount: 5 })).toBe('INVALID_AMOUNT');
    clients.forEach((c) => c.close());
  });

  it('pause blocks play until the host resumes', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await host.must('host:pause', { paused: true });
    await syncAll(clients);
    expect(a.pub.paused).toBe(true);
    expect(a.pub.timer).toBeNull();
    expect(await code(a, 'action:pack')).toBe('PAUSED');
    await host.must('host:pause', { paused: false });
    expect(await code(a, 'action:pack')).toBe('OK');
    clients.forEach((c) => c.close());
  });

  it('kick: the player is removed between rounds and their old link stops working', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('host:kick', { playerId: b.playerId });
    await a.waitFor((pub) => pub.players.find((p) => p.id === b.playerId)!.present === false);
    await until(() => b.events.some((e) => e.event.type === 'YOU_WERE_KICKED'));
    expect(await code(b, 'game:reconnect', { code: host.code, playerToken: b.token })).toBe(
      'BAD_TOKEN',
    );
    clients.forEach((c) => c.close());
  });

  it('rate-limits a socket that sends too many events', async () => {
    const c = new TestClient(srv.url, 'Spammer');
    await c.connected();
    const results = await Promise.all(Array.from({ length: 30 }, () => code(c, 'action:see')));
    expect(results).toContain('RATE_LIMITED');
    c.close();
  });
});

describe('persistence', () => {
  it('stores tokens only as hashes and round-trips the engine state exactly', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await a.must('action:see');
    await srv.server.manager.flushAll();

    const snap = (await srv.store.findGame(host.code!))!;
    const live = srv.server.manager.getGame(host.code!)!;
    expect(snap.currentRoundState).toEqual(live.table);
    expect(snap.status).toBe('active');
    const stored = snap.players.find((p) => p.id === a.playerId)!;
    expect(stored.tokenHash).toBe(hashToken(a.token!));
    expect(JSON.stringify(snap)).not.toContain(a.token!);
    clients.forEach((c) => c.close());
  });

  it('never logs the MongoDB connection string', () => {
    const uri = 'mongodb+srv://user:s3cret@cluster0.example.mongodb.net/db';
    registerSecret(uri);
    expect(redact(`failed to connect to ${uri}`)).not.toContain('s3cret');
    expect(redact('mongodb://admin:hunter2@host:27017')).not.toContain('hunter2');
  });
});
