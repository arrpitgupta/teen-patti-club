import type { ResultsPage } from '@tpc/shared';
import { describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import { setupTable, startTestServer, syncAll, until } from './test/helpers';

const getResults = async (url: string, id: string) => {
  const res = await fetch(`${url}/api/results/${id}`);
  return { status: res.status, text: await res.text() };
};

describe('results link', () => {
  it('every game gets a long random results id that opens a read-only page', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    const id = host.pub.resultsId;
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(id).not.toContain(host.code!);

    // While playing: the page shows the standings so far.
    let page = await getResults(srv.url, id);
    expect(page.status).toBe(200);
    expect((JSON.parse(page.text) as ResultsPage).status).toBe('lobby');

    await host.must('game:start');
    const hand = srv.server.manager
      .getGame(host.code!)!
      .table.round!.players.find((p) => p.id === a.playerId)!.hand!;
    await a.must('action:pack');
    await a.must('round:showCards');
    await host.must('game:end');
    await syncAll(clients);

    await until(async () => {
      const p = JSON.parse((await getResults(srv.url, id)).text) as ResultsPage;
      return p.rounds[0]?.shownHands[a.playerId!] !== undefined;
    });
    page = await getResults(srv.url, id);
    const body = JSON.parse(page.text) as ResultsPage;
    expect(body.status).toBe('ended');
    expect(body.code).toBe(host.code);
    expect(body.results!.rankings.map((r) => r.name).sort()).toEqual(['Asha', 'Host']);
    expect(body.results!.payments.length).toBe(1);
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0]!.reason).toBe('allPacked');
    expect(body.rounds[0]!.shownHands[a.playerId!]).toEqual(hand);
    expect(body.rounds[0]!.actions.map((x) => x.type)).toContain('PACK');
    expect(body.groupName).toBeNull();
    // "Best hand" only counts hands everyone saw: Asha showed hers, the host's stayed hidden.
    const best = (pid: string) => body.results!.rankings.find((r) => r.playerId === pid)!.bestHand;
    expect(best(a.playerId!)).not.toBeNull();
    expect(best(host.playerId!)).toBeNull();
    // Nothing secret: no tokens, hashes or the host's cards.
    expect(page.text).not.toContain(host.token!);
    expect(page.text).not.toContain('tokenHash');
    const hostHand = srv.server.manager
      .getGame(host.code!)!
      .table.round!.players.find((p) => p.id === host.playerId)!.hand!;
    expect(page.text).not.toContain(JSON.stringify(hostHand));
    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('unknown or malformed ids are 404, and the join code is not a results id', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host']);
    expect((await getResults(srv.url, 'x'.repeat(22))).status).toBe(404);
    expect((await getResults(srv.url, clients[0]!.code!)).status).toBe(404);
    expect((await getResults(srv.url, '../games')).status).toBe(404);
    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('keeps the same id after a server restart', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const id = clients[0]!.pub.resultsId;
    const code = clients[0]!.code!;
    clients.forEach((c) => c.close());
    await srv.stop();
    const again = await startTestServer({ dbName: srv.dbName });
    expect(again.server.manager.getGame(code)!.resultsId).toBe(id);
    expect((await getResults(again.url, id)).status).toBe(200);
    await again.stop();
  });
});
