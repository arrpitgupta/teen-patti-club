import { inject } from 'vitest';
import { describe, expect, it } from 'vitest';
import { createServer } from './app';
import { loadConfig } from './config';
import { MongoGameStore } from './store/mongo';
import type { GameSnapshot, GameStore } from './store/types';
import type { TestClient } from './test/helpers';
import { physical, digital, setupTable, startTestServer, syncAll, until } from './test/helpers';

const health = async (url: string) => {
  const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
  return (await res.json()) as {
    ok: boolean;
    restoring: boolean;
    needsAttention: number;
    games: number;
  };
};

/** Five games in awkward states, saved to the database, then the server stops. */
async function trickyGames(url: string) {
  const codes: Record<string, string> = {};
  const all: TestClient[] = [];

  // 1. Paused mid-round.
  {
    const c = await setupTable(url, ['Host', 'Asha']);
    await c[0]!.must('game:start');
    await c[0]!.must('host:pause', { paused: true });
    codes.paused = c[0]!.code!;
    all.push(...c);
  }
  // 2. Digital turn whose timer will already be over (short grace after the restart).
  {
    const c = await setupTable(url, ['Host', 'Asha', 'Bilal'], digital({ turnTimerSec: 30 }));
    await c[0]!.must('game:start');
    codes.timer = c[0]!.code!;
    all.push(...c);
  }
  // 3. A player who left and one who will be disconnected.
  {
    const c = await setupTable(url, ['Host', 'Asha', 'Bilal']);
    await c[2]!.must('game:leave');
    await c[0]!.must('game:start');
    codes.left = c[0]!.code!;
    all.push(...c);
  }
  // 4. Physical, awaiting the result of a show.
  {
    const c = await setupTable(url, ['Host', 'Asha'], physical());
    const [host, a] = c as [TestClient, TestClient];
    await host.must('game:start');
    await host.must('round:cardsDealt');
    await a.must('action:show');
    await syncAll(c);
    expect(host.pub.table.round!.phase).toBe('AWAITING_RESULT');
    codes.result = host.code!;
    all.push(...c);
  }
  // 5. Waiting for the answer to a side show.
  {
    const c = await setupTable(url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = c as [TestClient, TestClient, TestClient];
    await host.must('game:start');
    await a.must('action:see');
    await a.must('action:chaal', { amount: 20 });
    await b.must('action:see');
    await b.must('action:sideshowRequest');
    await syncAll(c);
    expect(host.pub.table.round!.phase).toBe('AWAITING_SIDESHOW_RESPONSE');
    codes.sideshow = host.code!;
    all.push(...c);
  }
  return { codes, clients: all };
}

describe('restoring games after a restart', () => {
  it('restores games in tricky states and keeps answering /health', async () => {
    const first = await startTestServer();
    const { codes, clients } = await trickyGames(first.url);
    // A corrupt game too: its turn belongs to a player who isn't in the round.
    const good = (await first.store.findGame(codes.timer!))!;
    const broken: GameSnapshot = structuredClone(good);
    broken.code = 'BRKN23';
    broken.resultsId = 'b'.repeat(22);
    broken.currentRoundState.round!.turnId = 'nobody';
    await first.store.saveGame(broken);
    clients.forEach((c) => c.close());
    await first.stop();

    // Restart with a 50 ms grace period: the digital turn is already over by then.
    const second = await startTestServer({ dbName: first.dbName, manager: { graceMs: 50 } });
    const m = second.server.manager;
    const h = await health(second.url);
    expect(h).toMatchObject({ ok: true, restoring: false, needsAttention: 1, games: 5 });
    for (const code of Object.values(codes)) expect(m.getGame(code)).toBeDefined();
    expect(m.getGame('BRKN23')).toBeUndefined();
    expect(m.skipped.get('BRKN23')).toMatch(/turn/);
    expect((await second.store.findGame('BRKN23'))!.needsAttention?.reason).toMatch(/turn/);

    expect(m.getGame(codes.paused!)!.paused).toBe(true);
    expect(m.getGame(codes.result!)!.table.round!.phase).toBe('AWAITING_RESULT');
    expect(m.getGame(codes.sideshow!)!.table.round!.phase).toBe('AWAITING_SIDESHOW_RESPONSE');
    // Everyone is disconnected after a restart; the expired digital turn auto-packs…
    await until(() => (m.getGame(codes.timer!)!.table.round!.actions.length ?? 0) > 0);
    // …and the server keeps answering while timers fire.
    for (let i = 0; i < 5; i++) {
      expect((await health(second.url)).ok).toBe(true);
      await new Promise((r) => setTimeout(r, 60));
    }
    await second.stop();

    // A third start skips the marked game without trying again.
    const third = await startTestServer({ dbName: first.dbName });
    expect(third.server.manager.getGame('BRKN23')).toBeUndefined();
    expect(third.server.manager.skipped.size).toBe(0);
    await third.stop();
  });

  it('answers /health while games are still loading, and game requests wait', async () => {
    const first = await startTestServer();
    const clients = await setupTable(first.url, ['Host', 'Asha']);
    const code = clients[0]!.code!;
    clients.forEach((c) => c.close());
    await first.stop();

    const store = await MongoGameStore.connect(inject('mongoUri'), first.dbName);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: GameStore = Object.create(store) as GameStore;
    slow.loadOpenGames = async () => {
      await gate;
      return store.loadOpenGames();
    };
    const server = createServer({
      config: loadConfig({ NODE_ENV: 'test', CLIENT_ORIGIN: 'http://localhost:5317' }),
      store: slow,
    });
    const started = server.start(0);
    await until(() => server.httpServer.listening);
    const { port } = server.httpServer.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;

    expect(await health(url)).toMatchObject({ ok: true, restoring: true, games: 0 });
    // Game data waits for the restore instead of answering "not found".
    const pending = fetch(`${url}/api/games/${code}`).then((r) => r.status);
    await new Promise((r) => setTimeout(r, 100));
    release();
    await started;
    expect(await pending).toBe(200);
    expect(await health(url)).toMatchObject({ restoring: false, games: 1 });
    await server.stop();
    await store.close();
  });

  it('a store that never answers does not stop the server', async () => {
    const first = await startTestServer();
    const store = first.store;
    const stuck: GameStore = Object.create(store) as GameStore;
    stuck.loadOpenGames = () => new Promise(() => {});
    const server = createServer({
      config: loadConfig({ NODE_ENV: 'test', CLIENT_ORIGIN: 'http://localhost:5317' }),
      store: stuck,
      managerOptions: { restoreLoadTimeoutMs: 200 },
    });
    const port = await server.start(0);
    expect(await health(`http://127.0.0.1:${port}`)).toMatchObject({ ok: true, restoring: false });
    await server.stop();
    await first.stop();
  });
});
