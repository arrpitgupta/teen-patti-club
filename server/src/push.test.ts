import { describe, expect, it } from 'vitest';
import type { PushMessage, PushSender, PushSubscriptionData } from './push';
import type { TestClient } from './test/helpers';
import { byId, setupTable, sleep, startTestServer, syncAll, until } from './test/helpers';

function fakeSender() {
  const sent: { sub: PushSubscriptionData; msg: PushMessage }[] = [];
  const gone = new Set<string>();
  const sender: PushSender = {
    publicKey: 'test-public-key',
    async send(sub, msg) {
      sent.push({ sub, msg });
      return { gone: gone.has(sub.endpoint) };
    },
  };
  return { sender, sent, gone };
}

const sub = (name: string) => ({
  endpoint: `https://push.example.com/${name}`,
  keys: { p256dh: `p256-${name}`, auth: `auth-${name}` },
});

describe('"your turn" web push', () => {
  it('pushes only to the player whose turn it is, with no cards; subscriptions stay private', async () => {
    const push = fakeSender();
    const srv = await startTestServer({
      manager: { push: push.sender, nudgeAfterMs: 0, nudgeCooldownMs: 0 },
    });
    const res = await fetch(`${srv.url}/api/push/key`);
    expect(await res.json()).toEqual({ publicKey: 'test-public-key' });

    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    for (const c of clients) await c.must('push:subscribe', { subscription: sub(c.name) });
    await clients[0]!.must('game:start');
    await syncAll(clients);
    const first = byId(clients, clients[0]!.pub.table.round!.turnId);
    await until(() => push.sent.length === 1);
    expect(push.sent[0]!.sub.endpoint).toBe(sub(first.name).endpoint);
    expect(push.sent[0]!.msg).toMatchObject({
      title: 'Your turn',
      tag: `tpc-${first.code}`,
      url: `/g/${first.code}`,
    });

    // No cards in any notification.
    const game = srv.server.manager.getGame(first.code!)!;
    const cards = game.table.round!.players.flatMap((p) => p.hand!);
    for (const s of push.sent)
      for (const c of cards) expect(JSON.stringify(s.msg)).not.toContain(c);

    // Someone else looking at their cards doesn't push again; the next turn does.
    const other = clients.find((c) => c !== first)!;
    await other.must('action:see');
    await sleep(50);
    expect(push.sent).toHaveLength(1);
    await first.must('action:chaal', { amount: 10 });
    await until(() => push.sent.length === 2);
    expect(push.sent[1]!.sub.endpoint).not.toBe(sub(first.name).endpoint);

    // A nudge pushes too.
    await syncAll(clients);
    const waiting = byId(clients, clients[0]!.pub.table.round!.turnId);
    await clients.find((c) => c !== waiting)!.must('game:nudge');
    await until(() => push.sent.some((s) => s.msg.title === 'Jaldi chal!'));

    // Endpoints are never sent to clients.
    for (const c of clients) expect(c.received.join('\n')).not.toContain('push.example.com');
    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('unsubscribe and expired subscriptions stop the pushes', async () => {
    const push = fakeSender();
    const srv = await startTestServer({ manager: { push: push.sender } });
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('push:subscribe', { subscription: sub('host') });
    await a.must('push:subscribe', { subscription: sub('a') });
    await a.must('push:unsubscribe', { endpoint: sub('a').endpoint });
    push.gone.add(sub('host').endpoint);
    await host.must('game:start');
    await syncAll(clients);
    // 2 players: Asha (left of the host-dealer) acts first, but she unsubscribed.
    await sleep(50);
    expect(push.sent).toHaveLength(0);
    await a.must('action:chaal', { amount: 10 });
    await until(() => push.sent.length === 1); // host, whose subscription is gone
    await until(() => srv.server.manager.getGame(host.code!)!.players[0]!.push.length === 0);
    await host.must('action:pack');
    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('rejects invalid subscriptions and reports when push is off', async () => {
    const srv = await startTestServer({ manager: { push: null } });
    expect((await fetch(`${srv.url}/api/push/key`)).status).toBe(404);
    const [host] = (await setupTable(srv.url, ['Host', 'Asha'])) as [TestClient];
    const bad = await host.call('push:subscribe', {
      subscription: { endpoint: 'http://insecure.example.com', keys: { p256dh: 'x', auth: 'y' } },
    });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    const off = await host.must<{ enabled: boolean }>('push:subscribe', {
      subscription: sub('h'),
    });
    expect(off.enabled).toBe(false);
    srv.server.io.disconnectSockets();
    await srv.stop();
  });
});
