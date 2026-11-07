import { defineConfig } from '@playwright/test';

// Separate ports so e2e runs don't clash with a running `pnpm dev` (4000 / 5317).
const SERVER_PORT = 4100;
const CLIENT_PORT = 5400;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // In-memory MongoDB: never touches the real database.
      command: 'pnpm --filter @tpc/server dev:memory',
      url: `http://localhost:${SERVER_PORT}/health`,
      env: { PORT: String(SERVER_PORT), CLIENT_ORIGIN: `http://localhost:${CLIENT_PORT}` },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `pnpm exec vite --port ${CLIENT_PORT} --strictPort`,
      url: `http://localhost:${CLIENT_PORT}`,
      env: { VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
