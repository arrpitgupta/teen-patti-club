// Development server backed by an in-memory MongoDB (nothing touches Atlas).
// Used by the client's Playwright tests and handy for trying things out: `pnpm dev:memory`.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer } from './app';
import { loadConfig } from './config';
import { MongoGameStore } from './store/mongo';
import { log } from './util/log';

async function main(): Promise<void> {
  const config = loadConfig({ ...process.env, MONGODB_URI: undefined, NODE_ENV: 'development' });
  const mongod = await MongoMemoryServer.create();
  const store = await MongoGameStore.connect(mongod.getUri(), 'dev');
  const server = createServer({ config, store });
  const port = await server.start(Number(process.env.PORT ?? config.PORT));
  log.info(`dev server with in-memory MongoDB listening on :${port}`);

  const shutdown = async () => {
    await server.stop({ flush: true });
    await store.close();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e: unknown) => {
  log.error('fatal:', e);
  process.exit(1);
});
