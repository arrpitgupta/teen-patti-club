import { parseCards, type Card } from '@tpc/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  physical,
  setupTable,
  startTestServer,
  syncAll,
  type TestClient,
  type TestServer,
} from './test/helpers';

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

describe('physical mode: Enter my hand over the wire', () => {
  it('entered hands reach nobody else; a side show reveals them only to the two players', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal'], physical());
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    // Seats: Host 0 (dealer), Asha 1 (first), Bilal 2.
    const asha = parseCards('As Ad 3c');
    const bilal = parseCards('7s 8s 9s');

    await a.must('action:enterHand', { cards: asha });
    await syncAll(clients);
    expect(a.priv.hand).toEqual(asha);
    expect(a.pub.table.round!.players.find((p) => p.id === a.playerId)).toMatchObject({
      seen: true,
      status: 'seen',
    });
    await a.must('action:chaal', { amount: 20 });
    // After betting with it, the hand is fixed.
    const locked = await a.call('action:enterHand', { cards: parseCards('As Ad 4c') });
    expect(locked.ok).toBe(false);

    await b.must('action:enterHand', { cards: bilal });
    await b.must('action:sideshowRequest');
    await a.must('action:sideshowRespond', { accept: true });
    await syncAll(clients);
    const c = host.pub.table.round!.comparison!;
    expect(c.method).toBe('entered');
    expect(c.proposal!.winnerIds).toEqual([b.playerId]);
    expect(a.priv.visibleHands).toEqual({ [b.playerId!]: bilal });

    await a.must('result:confirm');
    await b.must('result:confirm');
    await syncAll(clients);
    expect(host.pub.table.round!.players.find((p) => p.id === a.playerId)!.packed).toBe(true);
    await host.must('action:pack'); // Bilal wins without a show
    await syncAll(clients);
    expect(host.pub.table.round!.result).toMatchObject({ reason: 'allPacked', revealedHands: {} });

    expect(sawAny(host, [...asha, ...bilal])).toEqual([]);
    expect(sawAny(a, bilal)).toEqual(bilal); // legal: side show
    clients.forEach((x) => x.close());
  });

  it('two players claiming the same card re-check with the card picker; nothing leaks first', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha'], physical());
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    await host.must('action:enterHand', { cards: parseCards('As Kd 2c') });
    await a.must('action:enterHand', { cards: parseCards('As Ad 3c') });
    await a.must('action:show');
    await syncAll(clients);
    expect(a.pub.table.round!.comparison).toMatchObject({ method: 'enterCards', clash: true });
    expect(a.events.some((e) => e.event.type === 'HANDS_CLASH')).toBe(true);
    expect(sawAny(a, parseCards('Kd 2c'))).toEqual([]);
    expect(sawAny(host, parseCards('Ad 3c'))).toEqual([]);

    await host.must('result:enterCards', { cards: parseCards('Ac Kd 2c') });
    await a.must('result:enterCards', { cards: parseCards('As Ad 3c') });
    await syncAll(clients);
    expect(host.pub.table.round!.result).toMatchObject({
      winnerIds: [a.playerId],
      resolution: 'enterCards',
    });
    clients.forEach((x) => x.close());
  });

  it('dispute falls back to tap-winner; a hand that was not entered is never revealed', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha'], physical());
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    await host.must('action:enterHand', { cards: parseCards('Ks Kd 2c') });
    await a.must('action:enterHand', { cards: parseCards('Qs Qd 3c') });
    await a.must('action:show');
    await host.must('result:dispute');
    await syncAll(clients);
    expect(a.pub.table.round!.comparison).toMatchObject({ method: 'tapWinner', proposal: null });
    expect(a.priv.visibleHands).toEqual({});
    await a.must('result:tapWinner', { winnerIds: [a.playerId] });
    await host.must('result:confirm');
    await syncAll(clients);
    expect(host.pub.table.round!.result).toMatchObject({
      winnerIds: [a.playerId],
      resolution: 'tapWinner',
      revealedHands: {},
    });
    clients.forEach((x) => x.close());
  });
});
