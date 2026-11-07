import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  digital,
  physical,
  setupTable,
  sleep,
  startTestServer,
  type TestClient,
  type TestServer,
} from './test/helpers';

// Scale turn timers down: a 30 s setting lasts 300 ms here.
let srv: TestServer;
beforeAll(async () => {
  srv = await startTestServer({ manager: { turnMs: (s) => s * 10 } });
});
afterAll(async () => {
  await srv.stop();
});

const packed = (c: TestClient, viewer: TestClient) =>
  viewer.pub.table.round!.players.find((p) => p.id === c.playerId)!.packed;

describe('turn timer', () => {
  it('digital: when the turn timer runs out the player auto-packs', async () => {
    const clients = await setupTable(
      srv.url,
      ['Host', 'Asha', 'Bilal'],
      digital({ turnTimerSec: 30 }),
    );
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('game:start');
    await host.waitFor(() => packed(a, host), 3000);
    expect(host.events.find((e) => e.event.type === 'PACKED')?.event).toMatchObject({
      playerId: a.playerId,
      timedOut: true,
    });
    clients.forEach((c) => c.close());
  });

  it('physical: when the turn timer runs out nobody is packed; the turn is marked overdue', async () => {
    const clients = await setupTable(
      srv.url,
      ['Host', 'Asha', 'Bilal'],
      physical({ turnTimerSec: 30 }),
    );
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    await b.waitFor((pub) => pub.timer?.kind === 'overdue', 3000);
    expect(b.pub.timer!.playerId).toBe(a.playerId);
    expect(b.events.some((e) => e.event.type === 'TURN_OVERDUE')).toBe(true);
    await sleep(600);
    expect(packed(a, host)).toBe(false);
    expect(host.pub.timer!.kind).toBe('overdue'); // stays overdue until Asha acts

    // Asha finally acts: the next player gets a fresh timer.
    await a.must('action:chaal', { amount: 10 });
    await host.waitFor((pub) => pub.timer?.kind === 'turn' && pub.timer.playerId === b.playerId);
    clients.forEach((c) => c.close());
  });

  it('physical: an unanswered side show is not auto-denied either', async () => {
    const clients = await setupTable(
      srv.url,
      ['Host', 'Asha', 'Bilal'],
      physical({ turnTimerSec: 30 }),
    );
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    await a.must('action:see');
    await a.must('action:chaal', { amount: 20 });
    await b.must('action:see');
    await b.must('action:sideshowRequest');
    await host.waitFor(
      (pub) => pub.timer?.kind === 'overdue' && pub.timer.playerId === a.playerId,
      3000,
    );
    expect(host.pub.table.round!.phase).toBe('AWAITING_SIDESHOW_RESPONSE');
    clients.forEach((c) => c.close());
  });
});

describe('production mode', () => {
  it('does not serve the /dev console', async () => {
    const prod = await startTestServer({ nodeEnv: 'production' });
    expect((await fetch(`${prod.url}/dev`)).status).toBe(404);
    expect((await fetch(`${prod.url}/health`)).status).toBe(200);
    await prod.stop();
  });
});
