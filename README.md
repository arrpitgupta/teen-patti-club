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

Open http://localhost:5317.

**On your phone (same Wi-Fi):** open `http://<this computer's LAN IP>:5317` (Vite prints it as "Network"). The client finds the server on the same address automatically, and invite QR codes use your LAN address even if the host opened `localhost`. On Windows, allow Node through the firewall for private networks the first time.

No MongoDB handy? `pnpm --filter @tpc/server dev:memory` runs the server with an in-memory database (data is lost when it stops). Until the game UI exists, http://localhost:4000/dev is a developer console for playing through the server API (one tab per player). To test on a phone on the same Wi-Fi, use the network URL Vite prints and set `CLIENT_ORIGIN` / `VITE_SERVER_URL` to your machine's LAN IP.

## Scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Run server and client in watch mode   |
| `pnpm test`      | Run Vitest in `shared` and `server`   |
| `pnpm test:e2e`  | Playwright end-to-end tests (client)  |
| `pnpm typecheck` | Strict TypeScript check, all packages |
| `pnpm lint`      | ESLint                                |
| `pnpm format`    | Prettier (write)                      |
| `pnpm build`     | Production build of all packages      |

## Deployment

_Full steps will be written in the Deploy phase._

1. **MongoDB Atlas** — free M0 cluster, database user, network access, connection string → `MONGODB_URI`.
2. **Render** (server) — Web Service with these settings:
   - **Root directory:** leave empty (repo root, so the pnpm workspace and `@tpc/shared` are available).
   - **Build command:** `corepack enable && NODE_ENV=development pnpm install --frozen-lockfile && pnpm --filter @tpc/server build`
     (`NODE_ENV=development` for the install only, so the build tools in devDependencies are installed even though the service runs with `NODE_ENV=production`).
   - **Start command:** `pnpm --filter @tpc/server start`
   - **Health check path:** `/health`

   Environment variables:

   | Variable        | Value                                                         |
   | --------------- | ------------------------------------------------------------- |
   | `NODE_ENV`      | `production` — **required**. It turns off the `/dev` console. |
   | `MONGODB_URI`   | Atlas connection string                                       |
   | `CLIENT_ORIGIN` | Your Vercel URL, e.g. `https://teen-patti-club.vercel.app`    |

   After deploying, check that `https://<your-render-app>/dev` returns **404**.

3. **Vercel** (client) — import the repo and set:
   - **Root directory:** `client`
   - **Config variable** (Settings → Environment Variables): `VITE_SERVER_URL` = your Render URL, e.g. `https://teen-patti-club.onrender.com`. It is baked in at build time, so redeploy after changing it.

   The SPA rewrite to `index.html` is in `client/vercel.json`.

## License

Private project.
