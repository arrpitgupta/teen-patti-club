import { describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import { byId, setupTable, sleep, startTestServer, syncAll, until } from './test/helpers';

describe('nudge', () => {
  it('only after the wait, not for yourself, at most once per cooldown', async () => {
    const srv = await startTestServer({ manager: { nudgeAfterMs: 300, nudgeCooldownMs: 600 } });
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host] = clients as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await syncAll(clients);
    const turn = host.pub.turn!;
    expect(turn.playerId).toBe(host.pub.table.round!.turnId);
    const actor = byId(clients, turn.playerId);
    const other = clients.find((c) => c !== actor)!;

    // Too soon.
    expect(await other.call('game:nudge')).toMatchObject({
      ok: false,
      error: { code: 'TOO_SOON' },
    });
    await sleep(350);
    // Not yourself.
    expect(await actor.call('game:nudge')).toMatchObject({
      ok: false,
      error: { code: 'ILLEGAL_ACTION' },
    });
    await other.must('game:nudge');
    await until(() =>
      actor.events.some(
        (e) =>
          e.event.type === 'NUDGED' &&
          e.event.playerId === actor.playerId &&
          e.event.by === other.playerId,
      ),
    );
    expect(actor.pub.lastNudgeAt).not.toBeNull();

    // Cooldown is per table: nobody can nudge again right away.
    const third = clients.find((c) => c !== actor && c !== other)!;
    expect(await third.call('game:nudge')).toMatchObject({
      ok: false,
      error: { code: 'TOO_SOON' },
    });
    await sleep(650);
    await third.must('game:nudge');

    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('the wait restarts on every new turn and is not reset by others looking', async () => {
    const srv = await startTestServer({ manager: { nudgeAfterMs: 300, nudgeCooldownMs: 0 } });
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host] = clients as [TestClient];
    await host.must('game:start');
    await syncAll(clients);
    const first = host.pub.turn!;
    const actor = byId(clients, first.playerId);
    const looker = clients.find((c) => c !== actor)!;
    await sleep(200);
    await looker.must('action:see');
    await syncAll(clients);
    expect(host.pub.turn!.since).toBe(first.since);

    await actor.must('action:chaal', { amount: host.pub.table.round!.stake });
    await syncAll(clients);
    const second = host.pub.turn!;
    expect(second.playerId).not.toBe(first.playerId);
    expect(second.since).toBeGreaterThan(first.since);
    expect(await actor.call('game:nudge')).toMatchObject({ ok: false });

    // Paused: nobody to nudge.
    await host.must('host:pause', { paused: true });
    await syncAll(clients);
    expect(host.pub.turn).toBeNull();

    clients.forEach((c) => c.close());
    await srv.stop();
  });
});
