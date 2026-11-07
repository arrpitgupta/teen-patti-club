import {
  defaultSettings,
  type Ack,
  type ClientEventName,
  type EventBatch,
  type JoinResult,
  type LogEntry,
  type PrivateGameState,
  type PublicGameState,
  type Settings,
} from '@tpc/shared';
import { io as ioClient, type Socket } from 'socket.io-client';
import { inject } from 'vitest';
import { createServer, type AppServer } from '../app';
import { loadConfig } from '../config';
import type { ManagerOptions } from '../game/manager';
import type { SocketOptions } from '../sockets';
import { MongoGameStore } from '../store/mongo';
import { setSilent } from '../util/log';

setSilent(true);

let dbCounter = 0;

export interface TestServer {
  url: string;
  port: number;
  server: AppServer;
  store: MongoGameStore;
  dbName: string;
  stop(opts?: { flush?: boolean }): Promise<void>;
}

export async function startTestServer(
  opts: {
    dbName?: string;
    port?: number;
    manager?: Partial<ManagerOptions>;
    sockets?: Partial<SocketOptions>;
  } = {},
): Promise<TestServer> {
  const uri = inject('mongoUri');
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
    throw new Error('Tests must use the in-memory MongoDB');
  }
  const dbName = opts.dbName ?? `test_${process.pid}_${Date.now()}_${dbCounter++}`;
  const store = await MongoGameStore.connect(uri, dbName);
  const server = createServer({
    config: loadConfig({ NODE_ENV: 'test', CLIENT_ORIGIN: 'http://localhost:5317' }),
    store,
    managerOptions: { persistDebounceMs: 30, ...opts.manager },
    socketOptions: opts.sockets,
  });
  const port = await server.start(opts.port ?? 0);
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    server,
    store,
    dbName,
    async stop({ flush = true } = {}) {
      await server.stop({ flush });
      await store.close();
    },
  };
}

export const digital = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings('digital'),
  ...overrides,
});
export const physical = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings('physical'),
  ...overrides,
});

/** A socket.io client that records everything it receives. */
export class TestClient {
  readonly socket: Socket;
  publicStates: PublicGameState[] = [];
  privateStates: PrivateGameState[] = [];
  events: LogEntry[] = [];
  /** JSON of every message this socket received (state, events, errors and acks). */
  received: string[] = [];
  code?: string;
  playerId?: string;
  token?: string;
  /** Re-send game:reconnect automatically when the socket reconnects (like the real client). */
  autoReconnect = true;

  constructor(
    url: string,
    readonly name = 'Player',
  ) {
    this.socket = ioClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnectionDelay: 50,
      reconnectionDelayMax: 200,
    });
    this.socket.on('state:public', (s: PublicGameState) => this.publicStates.push(s));
    this.socket.on('state:private', (s: PrivateGameState) => this.privateStates.push(s));
    this.socket.on('event', (b: EventBatch) => this.events.push(...b.entries));
    this.socket.onAny((_event: string, ...args: unknown[]) =>
      this.received.push(JSON.stringify(args)),
    );
    this.socket.on('connect', () => {
      if (this.autoReconnect && this.code && this.token) {
        void this.call('game:reconnect', { code: this.code, playerToken: this.token });
      }
    });
  }

  get pub(): PublicGameState {
    const s = this.publicStates.at(-1);
    if (!s) throw new Error(`${this.name} has no public state yet`);
    return s;
  }

  get priv(): PrivateGameState {
    const s = this.privateStates.at(-1);
    if (!s) throw new Error(`${this.name} has no private state yet`);
    return s;
  }

  call<T = unknown>(name: ClientEventName | string, payload: unknown = {}): Promise<Ack<T>> {
    return new Promise((resolve) => {
      this.socket.emit(name, payload, (ack: Ack<T>) => {
        this.received.push(JSON.stringify(ack));
        resolve(ack);
      });
    });
  }

  async must<T = unknown>(name: ClientEventName, payload: unknown = {}): Promise<T> {
    const ack = await this.call<T>(name, payload);
    if (!ack.ok) throw new Error(`${this.name} ${name}: ${ack.error.code} ${ack.error.message}`);
    return ack.data;
  }

  async create(settings: Settings = digital()): Promise<JoinResult> {
    const res = await this.must<JoinResult>('game:create', {
      name: this.name,
      avatar: '🦁',
      settings,
    });
    this.remember(res);
    return res;
  }

  async join(code: string): Promise<JoinResult> {
    const res = await this.must<JoinResult>('game:join', { code, name: this.name, avatar: '🐯' });
    this.remember(res);
    return res;
  }

  private remember(res: JoinResult): void {
    this.code = res.code;
    this.playerId = res.playerId;
    this.token = res.playerToken;
  }

  /** Resolve when the latest state satisfies `predicate`. */
  waitFor(
    predicate: (pub: PublicGameState, priv: PrivateGameState | undefined) => boolean,
    timeoutMs = 5000,
  ): Promise<void> {
    const check = () => {
      const pub = this.publicStates.at(-1);
      return pub !== undefined && predicate(pub, this.privateStates.at(-1));
    };
    if (check()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.name}: condition not met within ${timeoutMs} ms`));
      }, timeoutMs);
      const onState = () => {
        if (check()) {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('state:public', onState);
        this.socket.off('state:private', onState);
      };
      // Registered after the recording listeners, so the new state is already stored.
      this.socket.on('state:public', onState);
      this.socket.on('state:private', onState);
    });
  }

  waitForVersion(version: number, timeoutMs = 5000): Promise<void> {
    return this.waitFor((pub) => pub.version >= version, timeoutMs);
  }

  connected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve) => this.socket.once('connect', () => resolve()));
  }

  close(): void {
    this.autoReconnect = false;
    this.socket.disconnect();
  }
}

/** Host creates a game and the others join; resolves when everyone sees all players. */
export async function setupTable(
  url: string,
  names: string[],
  settings: Settings = digital(),
): Promise<TestClient[]> {
  const clients = names.map((n) => new TestClient(url, n));
  await Promise.all(clients.map((c) => c.connected()));
  const [host, ...others] = clients;
  const { code } = await host!.create(settings);
  for (const c of others) await c.join(code);
  await syncAll(clients);
  return clients;
}

/** Wait until every client has seen the newest version any of them has seen. */
export async function syncAll(clients: TestClient[]): Promise<void> {
  const versions = clients.map((c) => c.publicStates.at(-1)?.version ?? 0);
  const target = Math.max(...versions);
  await Promise.all(clients.map((c) => c.waitForVersion(target)));
}

export function byId(clients: TestClient[], id: string | null | undefined): TestClient {
  const c = clients.find((x) => x.playerId === id);
  if (!c) throw new Error(`No client for player ${id}`);
  return c;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until `fn` returns true. */
export async function until(fn: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeoutMs) throw new Error('until(): timed out');
    await sleep(20);
  }
}
