import { CHAT_MAX_CHARS, type ChatMessage } from '@tpc/shared';
import { describe, expect, it } from 'vitest';
import type { TestClient } from './test/helpers';
import { setupTable, startTestServer, until } from './test/helpers';

const texts = (msgs: ChatMessage[]) => msgs.map((m) => m.text);

describe('table chat', () => {
  it('delivers messages, presets and reactions to everyone at the table, in order', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];

    const sent = await a.must<ChatMessage>('chat:send', { text: '  hello   table  ' });
    expect(sent).toMatchObject({ playerId: a.playerId, kind: 'text', text: 'hello table' });
    await b.must('chat:send', { text: 'Pack kar de!', quick: true });
    await host.must('chat:react', { emoji: '🔥' });

    await until(() => clients.every((c) => c.chat.length === 3));
    for (const c of clients) {
      expect(c.chat.map((m) => [m.kind, m.text])).toEqual([
        ['text', 'hello table'],
        ['quick', 'Pack kar de!'],
        ['reaction', '🔥'],
      ]);
      expect(c.chat.map((m) => m.id)).toEqual([1, 2, 3]);
    }

    // Saved with the game.
    await until(async () => (await srv.store.findGame(host.code!))?.chat.length === 3);

    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('rejects empty, too-long and unknown messages', async () => {
    const srv = await startTestServer();
    const [host] = (await setupTable(srv.url, ['Host', 'Asha'])) as [TestClient, TestClient];

    const empty = await host.call('chat:send', { text: '   ' });
    expect(empty).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    const long = await host.call('chat:send', { text: 'x'.repeat(CHAT_MAX_CHARS + 1) });
    expect(long).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    const max = await host.call('chat:send', { text: 'x'.repeat(CHAT_MAX_CHARS) });
    expect(max.ok).toBe(true);
    const longQuick = await host.call('chat:send', { text: 'x'.repeat(41), quick: true });
    expect(longQuick).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    const badEmoji = await host.call('chat:react', { emoji: '💩' });
    expect(badEmoji).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });

    srv.server.io.disconnectSockets();
    await srv.stop();
  });

  it('rate-limits chat per socket without blocking game actions', async () => {
    const srv = await startTestServer({ sockets: { chatCapacity: 3, chatPerSec: 0.001 } });
    const clients = await setupTable(srv.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];

    const acks = [];
    for (let i = 0; i < 5; i++) acks.push(await a.call('chat:react', { emoji: '😂' }));
    expect(acks.map((x) => x.ok)).toEqual([true, true, true, false, false]);
    expect(acks[3]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });

    // Only the accepted ones reach the table.
    await until(() => host.chat.length === 3);
    // Other players are not affected, and the limited player can still play.
    expect((await host.call('chat:send', { text: 'hi' })).ok).toBe(true);
    await host.must('game:start');

    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('a player who reconnects gets the messages they missed', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('chat:send', { text: 'before' });
    await until(() => b.chat.length === 1);

    // Bilal's phone drops off; the table keeps talking.
    b.socket.disconnect();
    await until(() => host.pub.players.some((p) => p.id === b.playerId && !p.connected));
    await a.must('chat:send', { text: 'while you were away' });
    await host.must('chat:react', { emoji: '😱' });
    await until(() => host.chat.length === 3);
    expect(texts(b.chat)).toEqual(['before']);

    // Back online: the client re-sends game:reconnect and gets the history.
    const historiesBefore = b.chatHistories.length;
    b.socket.connect();
    await until(() => b.chatHistories.length > historiesBefore, 10_000);
    expect(texts(b.chatHistories.at(-1)!)).toEqual(['before', 'while you were away', '😱']);

    clients.forEach((c) => c.close());
    await srv.stop();
  });

  it('chat survives a server restart', async () => {
    const first = await startTestServer();
    const { port, dbName } = first;
    const clients = await setupTable(first.url, ['Host', 'Asha']);
    const [host, a] = clients as [TestClient, TestClient];
    await host.must('chat:send', { text: 'one' });
    await a.must('chat:send', { text: 'two' });
    await until(async () => (await first.store.findGame(host.code!))?.chat.length === 2);
    await first.stop({ flush: false });

    const second = await startTestServer({ port, dbName });
    const n = a.chatHistories.length;
    await until(() => a.chatHistories.length > n, 10_000);
    expect(texts(a.chatHistories.at(-1)!)).toEqual(['one', 'two']);
    // Ids keep counting after the restart.
    const next = await a.must<ChatMessage>('chat:send', { text: 'three' });
    expect(next.id).toBe(3);

    clients.forEach((c) => c.close());
    await second.stop();
  });

  it('removed players stop receiving chat and cannot send', async () => {
    const srv = await startTestServer();
    const clients = await setupTable(srv.url, ['Host', 'Asha', 'Bilal']);
    const [host, a, b] = clients as [TestClient, TestClient, TestClient];
    await host.must('host:kick', { playerId: b.playerId });
    await until(() => b.events.some((e) => e.event.type === 'YOU_WERE_KICKED'));

    await host.must('chat:send', { text: 'bye Bilal' });
    await until(() => a.chat.length === 1);
    expect(b.chat).toEqual([]);
    const res = await b.call('chat:send', { text: 'wait' });
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_IN_GAME' } });

    clients.forEach((c) => c.close());
    await srv.stop();
  });
});
