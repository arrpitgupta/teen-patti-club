import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server as SocketServer } from 'socket.io';
import type { Config } from './config';
import { DEV_CONSOLE_HTML } from './devConsole';
import { GameManager, type ManagerOptions } from './game/manager';
import { originChecker } from './origin';
import { createPushSender } from './push';
import { createRoutes } from './routes';
import { registerSockets, type SocketOptions } from './sockets';
import type { GameStore } from './store/types';
import { log } from './util/log';

export interface ServerDeps {
  config: Config;
  store: GameStore;
  managerOptions?: Partial<ManagerOptions>;
  socketOptions?: Partial<SocketOptions>;
}

export interface AppServer {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketServer;
  manager: GameManager;
  /**
   * Listen first (so /health answers right away), then restore games from the store.
   * Resolves with the actual port once restoring has finished.
   */
  start(port: number): Promise<number>;
  /** flush=false simulates a crash: pending (debounced) writes are dropped. */
  stop(opts?: { flush?: boolean }): Promise<void>;
}

export function createServer({
  config,
  store,
  managerOptions,
  socketOptions,
}: ServerDeps): AppServer {
  const origin = originChecker(config);
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin }));
  app.use(express.json({ limit: '32kb' }));

  const manager = new GameManager(store, { push: createPushSender(config), ...managerOptions });
  app.use(createRoutes(store, manager, { buildId: config.RENDER_GIT_COMMIT?.slice(0, 7) ?? null }));
  if (config.NODE_ENV !== 'production') {
    // Dev-only console for manual testing before the real client exists.
    app.get('/dev', (_req, res) => {
      res.type('html').send(DEV_CONSOLE_HTML);
    });
  }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error('request failed', err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, { cors: { origin } });
  registerSockets(io, manager, socketOptions);

  return {
    app,
    httpServer,
    io,
    manager,
    async start(port) {
      const restoring = manager.restore(); // game requests wait for it (manager.ready)
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, config.HOST, () => {
          httpServer.off('error', reject);
          resolve();
        });
      });
      await restoring.catch((e: unknown) => log.error('restore failed', e));
      return (httpServer.address() as AddressInfo).port;
    },
    async stop({ flush = true } = {}) {
      if (flush) await manager.flushAll();
      manager.stop();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
