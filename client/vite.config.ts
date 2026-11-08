import { networkInterfaces } from 'node:os';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const PORT = 5317;

/** First private IPv4 address of this machine, so QR codes work for phones on the same Wi-Fi. */
function lanOrigin(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && /^(10|172|192)\./.test(i.address)) {
        return `http://${i.address}:${PORT}`;
      }
    }
  }
  return null;
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __LAN_ORIGIN__: JSON.stringify(command === 'serve' ? lanOrigin() : null),
    // Short commit id of this build (Vercel sets VERCEL_GIT_COMMIT_SHA), shown on Home.
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'),
  },
  server: { port: PORT, strictPort: true, host: true },
  preview: { port: PORT, strictPort: true, host: true },
}));
