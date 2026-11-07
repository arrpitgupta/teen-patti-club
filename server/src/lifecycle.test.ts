import type { GameResults, GameSummary } from '@tpc/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoundRecord } from './store/types';
import { setupTable, startTestServer, syncAll, TestClient, type TestServer } from './test/helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.stop();
});

describe('REST', () => {
  it('GET /health', async () => {
    const res = await fetch(`${srv.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('GET /dev serves the dev console outside production', async () => {
    const res = await fetch(`${srv.url}/dev`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Teen Patti dev console');
  });

  it('GET /api/games/:code returns 404 for an unknown game and 400 for a bad code', async () => {
    expect((await fetch(`${srv.url}/api/games/ZZZZZZ`)).status).toBe(404);
    expect((await fetch(`${srv.url}/api/games/bad`)).status).toBe(400);
  });
});

describe('game lifecycle', () => {
  it('create → join → play a round → end game → results, REST summary and history', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    expect(host.pub.status).toBe('lobby');
    expect(host.pub.players.map((p) => p.name)).toEqual(['Host', 'Asha', 'Bilal']);
    expect(host.priv.isHost).toBe(true);
    expect(a.priv.isHost).toBe(false);

    await host.must('game:start');
    await syncAll(clients);
    const r = a.pub.table.round!;
    expect(a.pub.status).toBe('active');
    expect(r.phase).toBe('BETTING');
    expect(r.pot).toBe(30);
    expect(r.turnId).toBe(a.playerId); // left of the dealer (host)
    expect(a.pub.timer).toMatchObject({ playerId: a.playerId, kind: 'turn', durationMs: 45_000 });

    await a.must('action:chaal', { amount: 20 });
    await b.must('action:pack');
    await host.must('action:pack');
    await syncAll(clients);
    expect(host.pub.table.round!.result).toMatchObject({
      reason: 'allPacked',
      winnerIds: [a.playerId],
      pot: 50,
    });
    expect(host.pub.stats[a.playerId!]).toMatchObject({
      roundsPlayed: 1,
      roundsWon: 1,
      biggestPotWon: 50,
    });
    expect(host.pub.timer).toBeNull();
    expect(a.events.some((e) => e.event.type === 'ROUND_ENDED')).toBe(true);

    // Round 2 is still running when the host ends the game: it is cancelled.
    await host.must('round:start');
    const results = await host.must<GameResults>('game:end');
    await syncAll(clients);
    expect(a.pub.status).toBe('ended');
    expect(results.rankings.map((x) => x.name)[0]).toBe('Asha');
    expect(results.rankings.reduce((s, x) => s + x.net, 0)).toBe(0);
    expect(results.payments).toHaveLength(2);
    expect(results.payments.every((p) => p.to === a.playerId && p.amount === 10)).toBe(true);
    expect((await a.call('action:pack')).ok).toBe(false);

    const summary = (await (
      await fetch(`${srv.url}/api/games/${host.code}`)
    ).json()) as GameSummary;
    expect(summary).toMatchObject({ code: host.code, status: 'ended', roundNumber: 2 });

    const { rounds } = (await (await fetch(`${srv.url}/api/games/${host.code}/rounds`)).json()) as {
      rounds: RoundRecord[];
    };
    expect(rounds.map((x) => x.reason)).toEqual(['allPacked', 'cancelled']);
    expect(rounds[0]!.actions.map((x) => x.type)).toEqual(['CHAAL', 'PACK', 'PACK']);
    expect(rounds[0]!.actions[0]).toMatchObject({
      playerId: a.playerId,
      amount: 20,
      stakeAfter: 20,
      potAfter: 50,
    });

    const history = (await (
      await fetch(`${srv.url}/api/history`, {
        headers: { 'x-player-tokens': `${a.token},nonsense-token-123456` },
      })
    ).json()) as { games: GameSummary[] };
    expect(history.games.map((g) => g.code)).toContain(host.code);

    clients.forEach((c) => c.close());
  });

  it('a player can join a running game and plays from the next round', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    const late = new TestClient(srv.url, 'Late');
    await late.connected();
    await late.join(host.code!);
    const all = [host, a, late];
    await syncAll(all);
    expect(late.pub.table.round!.players.map((p) => p.id)).not.toContain(late.playerId);
    await a.must('action:pack');
    await host.must('round:start');
    await syncAll(all);
    expect(late.pub.table.round!.players.map((p) => p.id)).toContain(late.playerId);
    all.forEach((c) => c.close());
  });

  it('undo: a player asks, the host approves, the last bet is taken back', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await a.must('action:chaal', { amount: 15 });
    await b.must('undo:request');
    await syncAll(clients);
    expect(host.pub.pendingUndo).toMatchObject({ requestedBy: b.playerId });
    expect((await a.call('undo:approve')).ok).toBe(false); // only the host approves
    await host.must('undo:approve');
    await syncAll(clients);
    expect(b.pub.table.round).toMatchObject({ pot: 30, stake: 10, turnId: a.playerId });
    expect(b.pub.pendingUndo).toBeNull();
    expect(b.pub.table.corrections.at(-1)).toMatchObject({ type: 'UNDO' });
    clients.forEach((c) => c.close());
  });

  it('banker mode: the host adds an offline seat and plays for it', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    const { playerId: offlineId } = await host.must<{ playerId: string }>('host:addOfflineSeat', {
      name: 'Dadi',
      avatar: '👵',
    });
    await host.must('game:start');
    await syncAll(clients);
    expect(a.pub.players.find((p) => p.id === offlineId)).toMatchObject({
      isOffline: true,
      name: 'Dadi',
    });
    await a.must('action:chaal', { amount: 10 }); // seats: host 0, Asha 1, Dadi 2
    expect((await a.call('action:pack', { actAs: offlineId })).ok).toBe(false);
    await host.must('action:chaal', { amount: 10, actAs: offlineId });
    await syncAll(clients);
    expect(a.pub.table.round!.turnId).toBe(host.playerId);
    clients.forEach((c) => c.close());
  });
});
