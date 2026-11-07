# Teen Patti Club

A real-time, mobile-first web app for playing Teen Patti with friends — **for fun, with virtual chips only**. The app runs turns, bets, pot and rules, records every round, and at the end shows rankings and exactly **who owes whom**.

Works with **digital cards** (dealt to each phone) or **physical cards** (the app handles betting, maths and settlement only). Built so first-time players can learn as they play.

> No real money is handled by this app.

## Screenshots

_Coming soon._

## Tech

| Package   | Stack                                                                       |
| --------- | --------------------------------------------------------------------------- |
| `shared/` | TypeScript game engine, hand evaluator, settlement, zod schemas (pure)      |
| `server/` | Node.js 20, Express, Socket.io, Mongoose (MongoDB Atlas)                    |
| `client/` | React, Vite, TypeScript, Tailwind CSS, Framer Motion, Zustand, React Router |

## Local setup

Requirements: Node.js 20+ and pnpm (via corepack).

```bash
corepack enable pnpm          # or: corepack enable pnpm --install-directory <dir on PATH>
pnpm install
cp server/.env.example server/.env
cp client/.env.example client/.env
pnpm dev                      # server on :4000, client on :5317
```

Open http://localhost:5317. Until the game UI exists, http://localhost:4000/dev is a developer console for playing through the server API (one tab per player). To test on a phone on the same Wi-Fi, use the network URL Vite prints and set `CLIENT_ORIGIN` / `VITE_SERVER_URL` to your machine's LAN IP.

## Scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Run server and client in watch mode   |
| `pnpm test`      | Run Vitest in `shared` and `server`   |
| `pnpm typecheck` | Strict TypeScript check, all packages |
| `pnpm lint`      | ESLint                                |
| `pnpm format`    | Prettier (write)                      |
| `pnpm build`     | Production build of all packages      |

## Deployment

_Full steps will be written in the Deploy phase._

1. **MongoDB Atlas** — free M0 cluster, database user, network access, connection string → `MONGODB_URI`.
2. **Render** (server) — Web Service, root directory `server`, build `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @tpc/server build`, start `pnpm --filter @tpc/server start`, env vars `MONGODB_URI`, `CLIENT_ORIGIN`, `NODE_ENV=production`, health check path `/health`.
3. **Vercel** (client) — project root `client`, env var `VITE_SERVER_URL` = Render URL; SPA rewrite to `index.html` is in `client/vercel.json`.

## License

Private project.
