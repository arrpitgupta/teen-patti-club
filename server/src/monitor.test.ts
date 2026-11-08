import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './util/log';
import { during, startMonitor } from './util/monitor';

const block = (ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy: holds the event loop
  }
};

describe('event-loop monitor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns when the loop is blocked, naming what was running', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const stop = startMonitor({ lagWarnMs: 300, heartbeatMs: 60_000, stats: () => ({}) });
    await new Promise((r) => setTimeout(r, 150));
    during('timer:turn ABCDEF', () => block(600));
    await new Promise((r) => setTimeout(r, 250));
    stop();
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.includes('blocked'));
    expect(line).toMatch(/blocked for \d+ ms/);
    expect(line).toContain('timer:turn ABCDEF');
    expect(line).toMatch(/rss \d+ MB/);
  });

  it('writes a heartbeat with memory, loop lag and the given stats', async () => {
    const info = vi.spyOn(log, 'info').mockImplementation(() => {});
    const stop = startMonitor({
      lagWarnMs: 500,
      heartbeatMs: 100,
      stats: () => ({ games: 3, sockets: 7 }),
    });
    await new Promise((r) => setTimeout(r, 250));
    stop();
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('heartbeat'));
    expect(line).toMatch(/up \d+ min, rss \d+ MB.*loop lag p99 \d+ ms.*games 3, sockets 7/);
  });

  it('does not warn when nothing blocks', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const stop = startMonitor({ lagWarnMs: 500, heartbeatMs: 60_000, stats: () => ({}) });
    await new Promise((r) => setTimeout(r, 400));
    stop();
    expect(warn).not.toHaveBeenCalled();
  });
});
