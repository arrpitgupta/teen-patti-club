import { describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import { byId, setupTable, startTestServer, syncAll, until } from './test/helpers';

describe('server restart mid-round', () => {
  it('reloads the game from MongoDB and clients reconnect seamlessly', async () => {
    const first = await startTestServer();
    const { port, dbName } = first;
    const clients = await setupTable(first.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await a.must('action:see');
    await a.must('action:chaal', { amount: 30 }); // seen: 20..40
    await b.must('action:chaal', { amount: 20 }); // blind: 15..30
    await syncAll(clients);

    const before = host.pub.table.round!;
    const aHand = a.priv.hand;
    expect(before.pot).toBe(80);
    expect(before.turnId).toBe(host.playerId);

    // Wait until the debounced snapshot has reached MongoDB, then "crash" (no final flush).
    await until(async () => {
      const snap = await first.store.findGame(host.code!);
      return snap?.currentRoundState.round?.actions.length === 3;
    });
    await first.stop({ flush: false });
    await until(() => clients.every((c) => !c.socket.connected));

    // A new process starts on the same port and database.
    const second = await startTestServer({ port, dbName });
    expect(second.server.manager.getGame(host.code!)).toBeDefined();

    // socket.io reconnects automatically; the client re-sends game:reconnect with its token.
    await Promise.all(
      clients.map((c) =>
        c.waitFor(
          (pub) => pub.players.every((p) => p.connected) && pub.status === 'active',
          10_000,
        ),
      ),
    );
    await syncAll(clients);

    const after = host.pub.table.round!;
    expect(after.pot).toBe(before.pot);
    expect(after.stake).toBe(before.stake);
    expect(after.turnId).toBe(before.turnId);
    expect(after.players).toEqual(before.players);
    expect(a.priv.hand).toEqual(aHand);
    expect(host.priv.hand).toBeNull(); // still blind
    expect(host.priv.isHost).toBe(true);
    expect(host.pub.timer).toMatchObject({ playerId: host.playerId, kind: 'turn' });

    // Play continues to the end of the round and the game.
    await host.must('action:pack');
    const next = byId(clients, host.pub.table.round!.turnId ?? a.playerId);
    await next.must('action:pack');
    await syncAll(clients);
    expect(host.pub.table.round!.phase).toBe('ENDED');
    await host.must('game:end');
    await syncAll(clients);
    expect(b.pub.results!.rankings.reduce((s, r) => s + r.net, 0)).toBe(0);

    clients.forEach((c) => c.close());
    await second.stop();
  });
});
