import { createServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { ENGINE_VERSION } from '@tpc/shared';
import type { Config } from './config';

export interface AppHandles {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketServer;
}

export function createApp(config: Config): AppHandles {
  const app = express();
  app.use(cors({ origin: config.CLIENT_ORIGIN }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, engine: ENGINE_VERSION, uptime: process.uptime() });
  });

  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN },
  });

  // Socket handlers are added in Phase 3.

  return { app, httpServer, io };
}
