// Production diagnostics: event-loop lag warnings and a periodic heartbeat line, so the logs
// show when (and around what) the server stalls or dies.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { log } from './log';

/** What the server was last busy with (a socket event, a timer, a request, restoring a game). */
let current = 'idle';
let since = Date.now();
const recent: string[] = [];

/** Runs `fn` labelled as `label`, so a lag warning can say what was running. */
export function during<T>(label: string, fn: () => T): T {
  const prev = current;
  const prevSince = since;
  current = label;
  since = Date.now();
  recent.push(label);
  if (recent.length > 8) recent.shift();
  try {
    return fn();
  } finally {
    current = prev;
    since = prevSince;
  }
}

export function lastActivity(): { current: string; recent: string[] } {
  return { current, recent: [...recent] };
}

export interface MonitorOptions {
  /** Warn when the event loop was blocked longer than this. */
  lagWarnMs: number;
  /** Heartbeat interval. */
  heartbeatMs: number;
  /** Extra numbers for the heartbeat (games, sockets, …). */
  stats: () => Record<string, number | string | boolean>;
  now?: () => number;
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

export function memoryLine(): string {
  const m = process.memoryUsage();
  return `rss ${mb(m.rss)} MB, heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB, external ${mb(m.external)} MB`;
}

/**
 * A 100 ms ticker notices when it runs late: lateness above `lagWarnMs` means something held the
 * event loop. Logged after the loop is free again, with what was running (`during` labels).
 */
export function startMonitor(opts: MonitorOptions): () => void {
  const now = opts.now ?? Date.now;
  const TICK = 100;
  let expected = now() + TICK;
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  const ticker = setInterval(() => {
    const t = now();
    const lag = t - expected;
    expected = t + TICK;
    if (lag > opts.lagWarnMs) {
      const { recent: r } = lastActivity();
      log.warn(
        `event loop was blocked for ${lag} ms; last activity: ${r.length ? r.join(' → ') : 'none'}; ${memoryLine()}`,
      );
    }
  }, TICK);
  ticker.unref();

  const started = now();
  const heartbeat = setInterval(() => {
    const p99 = Math.round(histogram.percentile(99) / 1e6);
    const max = Math.round(histogram.max / 1e6);
    histogram.reset();
    const extra = Object.entries(opts.stats())
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    log.info(
      `heartbeat: up ${Math.round((now() - started) / 60_000)} min, ${memoryLine()}, loop lag p99 ${p99} ms / max ${max} ms, ${extra}`,
    );
  }, opts.heartbeatMs);
  heartbeat.unref();

  return () => {
    clearInterval(ticker);
    clearInterval(heartbeat);
    histogram.disable();
  };
}
