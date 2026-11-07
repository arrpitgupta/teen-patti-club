import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import {
  physical,
  setupTable,
  sleep,
  startTestServer,
  syncAll,
  type TestServer,
} from './test/helpers';

const GRACE_MS = 400;
const HOST_AWAY_MS = 400;

let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer({ manager: { graceMs: GRACE_MS, hostAwayMs: HOST_AWAY_MS } });
});
afterAll(async () => {
  await srv.stop();
});

const seatOf = (c: TestClient, viewer: TestClient) =>
  viewer.pub.players.find((p) => p.id === c.playerId)!;
const packed = (c: TestClient, viewer: TestClient) =>
  viewer.pub.table.round!.players.find((p) => p.id === c.playerId)!.packed;

/** Drop the connection without telling the client to stop reconnecting. */
async function dropAndReturn(c: TestClient, awayMs: number): Promise<void> {
  c.socket.disconnect();
  await sleep(awayMs);
  c.socket.connect(); // auto re-sends game:reconnect with the stored token
  await c.connected();
}

describe('disconnections', () => {
  it('shows the player as reconnecting, and restores their seat and cards on reconnect', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await a.must('action:see');
    const hand = a.priv.hand;
    expect(hand).toHaveLength(3);

    a.socket.disconnect();
    await host.waitFor((pub) => seatOf(a, host).connected === false && pub.players.length === 3);
    expect(host.events.some((e) => e.event.type === 'PLAYER_DISCONNECTED')).toBe(true);

    a.socket.connect();
    await a.waitFor((pub, priv) => seatOf(a, a).connected && priv?.hand !== null);
    expect(a.priv.hand).toEqual(hand);
    await host.waitFor(() => seatOf(a, host).connected);
    expect(seatOf(a, host).seat).toBe(1);
    clients.forEach((c) => c.close());
  });

  it('digital: a player who disconnects on their turn gets a grace period, then auto-packs', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await syncAll(clients);
    expect(host.pub.timer).toMatchObject({ playerId: a.playerId, kind: 'turn' });

    a.close();
    await host.waitFor((pub) => pub.timer?.kind === 'grace');
    expect(host.pub.timer).toMatchObject({ playerId: a.playerId, durationMs: GRACE_MS });
    expect(packed(a, host)).toBe(false);

    await host.waitFor(() => packed(a, host), GRACE_MS + 2000);
    const ev = host.events.find((e) => e.event.type === 'PACKED');
    expect(ev?.event).toMatchObject({ playerId: a.playerId, timedOut: true });
    clients.forEach((c) => c.close());
  });

  it('digital: coming back within the grace period resumes the turn timer (no auto-pack)', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await syncAll(clients);
    const firstDeadline = host.pub.timer!.deadline;

    await dropAndReturn(a, GRACE_MS / 4);
    await host.waitFor((pub) => pub.timer?.kind === 'turn' && seatOf(a, host).connected);
    await sleep(GRACE_MS * 2);
    expect(packed(a, host)).toBe(false);
    // Resumed with the time that was left, not a fresh 45 s.
    expect(host.pub.timer!.deadline).toBeGreaterThan(firstDeadline - 5_000);
    expect(host.pub.timer!.deadline - firstDeadline).toBeLessThan(GRACE_MS * 4);
    await a.must('action:pack');
    clients.forEach((c) => c.close());
  });

  it('physical: a disconnected player is never auto-packed; the host can pack for them', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal'], physical());
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    // While Asha is connected the host may not act for her.
    expect((await host.call('action:pack', { actAs: a.playerId })).ok).toBe(false);

    a.close();
    await host.waitFor(() => seatOf(a, host).connected === false);
    await sleep(GRACE_MS * 2);
    expect(host.pub.timer).toBeNull();
    expect(packed(a, host)).toBe(false);

    await host.must('action:pack', { actAs: a.playerId });
    await host.waitFor(() => packed(a, host));
    clients.forEach((c) => c.close());
  });

  it('host away too long: the longest-connected player is offered the host role', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];

    host.socket.disconnect();
    host.autoReconnect = false;
    await a.waitFor((pub) => pub.hostTransferOffer !== null, HOST_AWAY_MS + 2000);
    expect(a.pub.hostTransferOffer!.candidateId).toBe(a.playerId); // joined (connected) before Bilal

    expect((await b.call('host:claim')).ok).toBe(false);
    await a.must('host:claim');
    await b.waitFor((pub) => pub.hostPlayerId === a.playerId);
    expect(a.priv.isHost).toBe(true);

    // The old host comes back as a normal player.
    host.autoReconnect = true;
    host.socket.connect();
    await host.waitFor((pub, priv) => seatOf(host, host).connected && priv?.isHost === false);
    expect((await host.call('game:start')).ok).toBe(false);
    clients.forEach((c) => c.close());
  });

  it('host back in time: no offer is made', async () => {
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await dropAndReturn(host, HOST_AWAY_MS / 4);
    await sleep(HOST_AWAY_MS * 2);
    expect(a.pub.hostTransferOffer).toBeNull();
    expect(a.pub.hostPlayerId).toBe(host.playerId);
    clients.forEach((c) => c.close());
  });
});
