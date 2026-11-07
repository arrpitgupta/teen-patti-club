import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { httpServer } = createApp(config);

httpServer.listen(config.PORT, () => {
  console.log(`[server] listening on :${config.PORT} (origin ${config.CLIENT_ORIGIN})`);
});
