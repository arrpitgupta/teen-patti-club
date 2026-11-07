import type { JoinResult } from '@tpc/shared';
import { describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import { digital, setupTable, startTestServer, syncAll, until } from './test/helpers';

async function endedTable(url: string) {
  const clients = await setupTable(
    url,
    ['Host', 'Asha', 'Bilal'],
    digital({ boot: 20, turnTimerSec: 30 }),
  );
  const [host] = clients as [TestClient];
  await host.must('host:addOfflineSeat', { name: 'Dadi', avatar: '🦉' });
  await host.must('game:start');
  await host.must('game:end');
  await syncAll(clients);
  return clients as [TestClient, TestClient, TestClient];
}

describe('rematch', () => {
  it('first tap creates a game with the same settings; others join with one tap', async () => {
    const srv = await startTestServer();
    const [host, a, b] = await endedTable(srv.url);
    const oldCode = host.code!;

    // Asha starts the rematch and becomes its host.
    const res = await a.must<JoinResult>('game:rematch');
    expect(res.code).not.toBe(oldCode);
    await until(() => host.pub.rematchCode === res.code); // everyone on the old game sees it
    expect(host.events.some((e) => e.event.type === 'REMATCH_CREATED')).toBe(true);

    const next = srv.server.manager.getGame(res.code)!;
    expect(next.status).toBe('lobby');
    expect(next.hostPlayerId).toBe(res.playerId);
    expect(next.table.settings).toEqual(srv.server.manager.getGame(oldCode)!.table.settings);
    expect(next.table.settings.boot).toBe(20);
    // The offline seat came along.
    expect(next.players.map((p) => [p.name, p.isOffline])).toEqual([
      ['Asha', false],
      ['Dadi', true],
    ]);

    // Host and Bilal join with their old names; their sockets move to the new game.
    const h = await host.must<JoinResult>('game:rematch');
    const bb = await b.must<JoinResult>('game:rematch');
    expect(h.code).toBe(res.code);
    expect(bb.code).toBe(res.code);
    await until(() => a.pub.code === res.code && a.pub.players.length === 4);
    expect(a.pub.players.map((p) => p.name)).toEqual(['Asha', 'Dadi', 'Host', 'Bilal']);
    expect(a.pub.players.every((p) => p.isOffline || p.connected)).toBe(true);

    // Tapping again (e.g. second phone) gives the same seat, not a new one.
    const again = await host.call<JoinResult>('game:reconnect', {
      code: oldCode,
      playerToken: host.token,
    });
    expect(again.ok).toBe(true);
    const h2 = await host.must<JoinResult>('game:rematch');
    expect(h2.playerId).toBe(h.playerId);
    expect(srv.server.manager.getGame(res.code)!.players).toHaveLength(4);

    // The rematch can be played.
    await a.call('game:reconnect', { code: res.code, playerToken: res.playerToken });
    await a.must('game:start');

    for (const c of [host, a, b]) c.close();
    await srv.stop();
  });

  it('two players tapping at once still create a single rematch', async () => {
    const srv = await startTestServer();
    const [host, a, b] = await endedTable(srv.url);
    const [x, y, z] = await Promise.all([
      host.must<JoinResult>('game:rematch'),
      a.must<JoinResult>('game:rematch'),
      b.must<JoinResult>('game:rematch'),
    ]);
    expect(new Set([x.code, y.code, z.code]).size).toBe(1);
    expect(srv.server.manager.getGame(x.code)!.players).toHaveLength(4); // 3 + offline seat

    for (const c of [host, a, b]) c.close();
    await srv.stop();
  });

  it('is only for players of an ended game', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host] = clients as [TestClient];
    const early = await host.call('game:rematch');
    expect(early).toMatchObject({ ok: false, error: { code: 'ILLEGAL_ACTION' } });

    for (const c of clients) c.close();
    await srv.stop();
  });
});
