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

The deployed site is an installable app (PWA): Android shows "Install the app" on the home screen; on iPhone use Share → Add to Home Screen. It opens full screen, keeps the screen awake during a game, and the Learn section (tutorial, practice vs bots) works offline.

"Your turn" notifications need a secure page: they work on `localhost` and on the deployed https site, not on `http://<LAN IP>` (browsers only allow push on secure origins). iPhones need the app added to the Home Screen first.

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

Live: client on **Vercel** (`https://teen-patti-club.vercel.app`), server on **Render** (`https://teen-patti-club.onrender.com`), data in **MongoDB Atlas**. Pushing to `main` deploys both.

1. **MongoDB Atlas**: a free M0 cluster, a database user, network access `0.0.0.0/0` (Render has no fixed IP on the free plan), and the connection string → `MONGODB_URI`. The server creates its collections (`games`, `rounds`, `groups`) and indexes on start.
2. **Render** (server): a Web Service with these settings:
   - **Root directory:** leave empty (repo root, so the pnpm workspace and `@tpc/shared` are available).
   - **Build command:** `corepack enable && NODE_ENV=development pnpm install --frozen-lockfile && pnpm --filter @tpc/server build`
     (`NODE_ENV=development` for the install only, so the build tools in devDependencies are installed even though the service runs with `NODE_ENV=production`).
   - **Start command:** `pnpm --filter @tpc/server start`
   - **Health check path:** `/health`
   - **Auto-deploy:** on commit to `main`.

   Environment variables:

   | Variable                                 | Value                                                                                                           |
   | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
   | `NODE_ENV`                               | `production`: **required**. It turns off the `/dev` console and the LAN origins.                                |
   | `MONGODB_URI`                            | Atlas connection string (never logged)                                                                          |
   | `CLIENT_ORIGIN`                          | The Vercel URL, `https://teen-patti-club.vercel.app`. Several origins: comma-separated (e.g. a custom domain).  |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | From `npx web-push generate-vapid-keys` (run once, keep them). Without them, "your turn" notifications are off. |
   | `VAPID_SUBJECT`                          | `mailto:` address or `https://` URL push services can contact                                                   |

   On start the server logs a warning for a non-https `CLIENT_ORIGIN` or missing push settings.

3. **Vercel** (client): import the repo and set:
   - **Root directory:** `client` (framework preset Vite; build `vite build`, output `dist`).
   - **Environment variable:** `VITE_SERVER_URL` = `https://teen-patti-club.onrender.com`. It is baked in at build time, so redeploy after changing it.

   `client/vercel.json` rewrites every route except `/assets/*` to `index.html` (a missing asset must be a 404, not the page), serves `sw.js` with `no-cache` and hashed `/assets/*` as immutable.

### Checking a deploy

- `https://teen-patti-club.onrender.com/health` returns `{ ok: true, build: "<commit>", push: true, … }`. `build` is the deployed commit (Render sets `RENDER_GIT_COMMIT`); `push: false` means the VAPID keys are missing.
- The Home screen footer shows `Version <commit>` of the client (from Vercel's `VERCEL_GIT_COMMIT_SHA`). Both should match the latest commit on `main`.
- `https://teen-patti-club.onrender.com/dev` returns **404**.

### Updates on phones

The service worker keeps an offline copy of the app (network-first for pages, cache-first for hashed `/assets/`). After a deploy, the next page load gets the new version and old assets are dropped from the cache. A tab that stays open checks for a new version when it comes back to the foreground and every 30 minutes: away from a table it reloads by itself; at a table, practice or tutorial it shows "A new version is ready · Reload" so nobody loses a turn. Bump `SHELL` in `client/public/sw.js` only when the caching rules change.

### Free-plan notes

- Render's free plan sleeps after ~15 minutes without traffic; the first visit then takes ~30–60 s (the Home screen says "Waking up the table…"). Live games are saved to MongoDB and restored on start, and players reconnect automatically.
- "Your turn" notifications need the server awake, so they only arrive while a game is active.
- Web push and installing the app need https: they work on the Vercel URL, not on `http://<LAN IP>` during development. iPhone notifications only work after "Add to Home Screen" (iOS 16.4+).
- Vercel preview deployments (`*-git-*.vercel.app`) are not in `CLIENT_ORIGIN`, so they can't reach the server; add their URL there if you want to test one.

## License

Private project.
