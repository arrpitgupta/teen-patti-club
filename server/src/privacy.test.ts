import type { Card } from '@tpc/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTable, startTestServer, syncAll, TestClient, type TestServer } from './test/helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.stop();
});

function sawAny(client: TestClient, cards: readonly Card[]): Card[] {
  const all = client.received.join('\n');
  return cards.filter((c) => all.includes(`"${c}"`));
}

describe('private cards never leak', () => {
  it('a socket never receives another player’s cards, even after a side show between two others', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    // Seats: Host 0 (dealer), Asha 1, Bilal 2 → Asha acts first.

    const game = srv.server.manager.getGame(host.code!)!;
    const hands = Object.fromEntries(
      game.table.round!.players.map((p) => [p.id, p.hand!]),
    ) as Record<string, Card[]>;
    const handOf = (c: TestClient) => hands[c.playerId!]!;

    // Blind players don't get even their own cards.
    await syncAll(clients);
    expect(a.priv.hand).toBeNull();

    await a.must('action:see');
    expect(a.priv.hand).toEqual(handOf(a));
    await a.must('action:chaal', { amount: 20 });
    await b.must('action:see');
    await b.must('action:sideshowRequest'); // Bilal asks Asha
    await a.must('action:sideshowRespond', { accept: true });
    await syncAll(clients);

    // The two side-show players see each other's cards privately...
    expect(a.priv.visibleHands[b.playerId!]).toEqual(handOf(b));
    expect(b.priv.visibleHands[a.playerId!]).toEqual(handOf(a));
    // ...the third player sees nothing.
    expect(host.priv.visibleHands).toEqual({});

    // Finish the round without a show: the host packs.
    const turn = host.pub.table.round!.turnId;
    expect(turn).toBe(host.playerId);
    await host.must('action:pack');
    await syncAll(clients);
    expect(host.pub.table.round!.result!.reason).toBe('allPacked');
    expect(host.pub.table.round!.result!.revealedHands).toEqual({});

    // Across everything each socket ever received (states, events, acks):
    expect(sawAny(host, [...handOf(a), ...handOf(b)])).toEqual([]);
    expect(sawAny(a, handOf(host))).toEqual([]);
    expect(sawAny(b, handOf(host))).toEqual([]);
    // Sanity check that the scan works: each side-show player did receive the other's cards.
    expect(sawAny(a, handOf(b))).toEqual(handOf(b));

    clients.forEach((c) => c.close());
  });

  it('a spectator who joins mid-round gets no cards', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await a.must('action:see');
    const late = new TestClient(srv.url, 'Late');
    await late.connected();
    await late.join(host.code!);
    await syncAll([host, a, late]);
    const game = srv.server.manager.getGame(host.code!)!;
    const allCards = game.table.round!.players.flatMap((p) => p.hand!);
    expect(sawAny(late, allCards)).toEqual([]);
    expect(late.priv.hand).toBeNull();
    [...clients, late].forEach((c) => c.close());
  });
});
