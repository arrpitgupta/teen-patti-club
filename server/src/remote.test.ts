import { describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import { digital, setupTable, startTestServer, syncAll } from './test/helpers';

describe('away and show my cards', () => {
  it('an away player sits out the next round without paying the boot', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(
      srv.url,
      ['Host', 'Asha', 'Bilal'],
      digital({ chipMode: 'buyIn', startingChips: 500 }),
    );
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await b.must('game:away', { away: true });
    await host.must('game:start');
    await syncAll(clients);
    const r = host.pub.table.round!;
    expect(r.players.map((p) => p.id)).not.toContain(b.playerId);
    expect(host.pub.players.find((p) => p.id === b.playerId)!.balance).toBe(500);
    expect(host.pub.table.players.find((p) => p.id === b.playerId)!.away).toBe(true);
    expect(host.events.some((e) => e.event.type === 'PLAYER_AWAY')).toBe(true);
    // Back for the round after.
    await b.must('game:away', { away: false });
    await a.must('action:pack');
    await host.must('round:start');
    await syncAll(clients);
    expect(host.pub.table.round!.players.map((p) => p.id)).toContain(b.playerId);
    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('show my cards: everyone sees them only after the round, and they stay in the log', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    const hand = srv.server.manager
      .getGame(host.code!)!
      .table.round!.players.find((p) => p.id === a.playerId)!.hand!;
    expect((await a.call('round:showCards')).ok).toBe(false); // round still running
    await a.must('action:pack');
    await syncAll(clients);
    expect(host.received.join('\n')).not.toContain(`"${hand[0]}"`);

    await a.must('round:showCards');
    await syncAll(clients);
    expect(host.pub.table.round!.shownHands).toEqual({ [a.playerId!]: hand });
    const shown = host.pub.log.find((e) => e.event.type === 'HAND_SHOWN');
    expect(shown?.event).toEqual({ type: 'HAND_SHOWN', playerId: a.playerId, cards: hand });
    // Still in the log after the next round starts.
    await host.must('round:start');
    await syncAll(clients);
    expect(host.pub.log.some((e) => e.event.type === 'HAND_SHOWN')).toBe(true);
    clients.forEach((c) => c.close());
    await srv.stop();
  });
});
