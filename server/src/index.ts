import { existsSync } from 'node:fs';
import { createServer } from './app';
import { loadConfig, productionWarnings } from './config';
import { MongoGameStore } from './store/mongo';
import { log, registerSecret } from './util/log';

// Local development: read server/.env if present (Render sets real env vars).
if (existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');

async function main(): Promise<void> {
  const config = loadConfig();
  registerSecret(config.MONGODB_URI);
  if (!config.MONGODB_URI) {
    log.error('MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in.');
    process.exit(1);
  }

  let store: MongoGameStore;
  try {
    store = await MongoGameStore.connect(config.MONGODB_URI);
  } catch (e) {
    log.error('Could not connect to MongoDB:', e);
    process.exit(1);
  }
  log.info('connected to MongoDB');

  const server = createServer({ config, store });
  const port = await server.start(config.PORT);
  log.info(`listening on :${port} (allowed origin: ${config.CLIENT_ORIGIN})`);
  for (const w of productionWarnings(config)) log.warn(w);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, saving games and shutting down`);
    await server.stop({ flush: true });
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e: unknown) => {
  log.error('fatal:', e);
  process.exit(1);
});
