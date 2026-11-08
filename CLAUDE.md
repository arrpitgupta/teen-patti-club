# CLAUDE.md — Teen Patti Club

Real-time, mobile-first Teen Patti web app with **virtual chips only**. Full spec: [SPEC.md](SPEC.md) — read it before changing behaviour. Rule decisions that SPEC left open are in [docs/RULES.md](docs/RULES.md) and are binding. Features added or dropped after SPEC (chat, rematch, card scanning dropped, backlog…) are in [docs/ROADMAP.md](docs/ROADMAP.md). Work proceeds in the phases in SPEC §13; stop for user confirmation after each phase.

## Layout (pnpm workspaces)

- `shared/` (`@tpc/shared`) — pure TS engine: cards, evaluator, reducer `applyAction(state, action) -> { state, events }`, `GameDefinition` interface, comparison resolver, settlement, zod schemas. **No I/O, no `Date.now()`/`Math.random()` inside the reducer** — inject time and RNG so replay/undo is deterministic.
- `server/` (`@tpc/server`) — Express + Socket.io + Mongoose. Single source of truth. Live games in an in-memory `Map`, snapshotted to Mongo.
- `client/` (`@tpc/client`) — React + Vite + Tailwind + Framer Motion + Zustand + React Router. Imports `@tpc/shared` only for UI hints (legal moves, bet ranges); never decides outcomes.

`@tpc/shared` ships TypeScript source (`exports` → `src/index.ts`). Vite and tsx consume it directly; the server's tsup build inlines it (`noExternal`).

## Commands (run from repo root)

- `pnpm install`
- `pnpm dev` — server (:4000, tsx watch) + client (:5317) in parallel
- `pnpm test` — Vitest in shared + server · `pnpm --filter @tpc/shared test:watch`
- `pnpm test:e2e` — Playwright end-to-end (first time: `pnpm --filter @tpc/client exec playwright install chromium`)
- `pnpm --filter @tpc/server dev:memory` — server with an in-memory MongoDB (no Atlas needed)
- `pnpm typecheck` · `pnpm lint` · `pnpm format` / `pnpm format:check`
- `pnpm build` — all packages; server → `server/dist/index.js`, client → `client/dist`

pnpm is provided via corepack (`packageManager: pnpm@9.15.0`). On this machine the shim lives in `%APPDATA%\npm`.

## Engine shape (`shared/src`)

- `cards/` card codes (`"As"`, `"Td"`), deck, `shuffle(cards, randomInt)`.
- `evaluator/` `evaluateHand` (single numeric score), `describeHand`, `explainComparison`.
- `games/teenPatti/` `applyAction(table, action)` → `{ ok, state, events } | { ok: false, error }`; `legalActions` (UI hints); `publicView` / `privateView` (the only things the server may emit); `planNextRound`; `replayRound`.
  - Round actions go through `round.ts`; comparisons go through a pluggable resolver (digital = instant, physical = players' input).
  - Digital `START_ROUND` takes a deck the server shuffled with `crypto.randomInt` — the reducer itself has no randomness, so undo/replay is exact.
- `settlement/` `computeNets`, `settle` (greedy), `rankByNet`.
- `schemas/` zod schemas for every client→server socket payload (`parseClientEvent`).
- Tests: `games/teenPatti/simulation.test.ts` plays 300 random seeded games checking chip conservation and replay; `testUtils.ts` has `makeTable`, `startWith` (rigged hands), `act`.

## Server shape (`server/src`)

- `game/manager.ts` `GameManager`: live games in a `Map`, the only place that calls the engine. Restores open games after a start in a guarded step (`restoreOne`: sanity checks, builds every view, 1 s budget, 30 s load timeout); a failing game is logged, marked `needsAttention` in Mongo and skipped (also on later starts and reconnects). The server listens on `HOST` (default `0.0.0.0`) _before_ restoring; `/health` answers meanwhile (`restoring`, `needsAttention` count) and game requests/socket events await `manager.ready`. Handles create/join/reconnect, every client event (`handle`), banker-mode `actAs`, turn timer + 60 s disconnect grace (digital only), host-away offer (2 min), debounced snapshots (300 ms; immediate at round/game end), restore on boot.
- `sockets.ts` binds sockets to `(code, playerId)`, rate-limits, validates with `parseClientEvent`, replies via ack (or `error` event), broadcasts `state:public` to the room and `state:private` per player. Never emit engine state directly — only `game/views.ts` output.
- `store/mongo.ts` Mongoose models (`games`, `rounds`). `minimize: false` is required (engine state has empty objects). Lobby games expire after 24 h (partial TTL index).
- `routes.ts` `/health`, `/api/games/:code` (+ group members for joiners), `/api/games/:code/rounds`, `/api/history` (tokens in `x-player-tokens` header), `/api/results/:resultsId` (public read-only results page; never include tokens or the group id), `/api/groups` (POST, rate-limited per IP) and `/api/groups/:id` (GET/PATCH). `/dev` is a dev-only test console (not served in production).
- Results links and groups: each game has `resultsId` (22-char random, `SecretIdSchema`). `game/groups.ts` `GroupService` caches groups used by live games and matches seats to members (`memberId` on players) — explicit `memberId`, else a free member with the same name, else a new member. Leaderboards are computed by `groupLeaderboard` in `shared/src/groups.ts` (client-side, so "this month" uses the viewer's time zone). Stats' `bestHand` only counts hands that were revealed or shown.
- Wire types (`PublicGameState`, `PrivateGameState`, `Ack`, …) live in `shared/src/protocol.ts`.
- Never log `MONGODB_URI`: use `util/log.ts` (redacts registered secrets and credentials in connection strings).
- Tests: `vitest` with one `mongodb-memory-server` for the run (`test/globalSetup.ts`); helpers in `test/helpers.ts` (`startTestServer`, `TestClient`, `setupTable`, `syncAll`). Tests never read `server/.env`. First run downloads/starts mongod and can take ~2 min.

## Client shape (`client/src`)

- Design: "Midnight Felt" (design canvas approved in Phase 4). Tokens in `tailwind.config.ts`. Gold (`gold-*`) only for the pot, the player to act and your turn; Seen pills are ivory; open-tab seats show nets in `up`/`down`, buy-in seats show balances. Minimum text 12 px on table screens; tap targets ≥ 44 px.
- `lib/model.ts` `buildModel(pub, priv, meId)` → everything a table screen needs. Legal moves come from the shared engine via `tableFromPublic` + `legalActions` — never hard-code bet ranges, costs or hints. `actorId` is you, or (host) an offline/disconnected seat whose turn it is (banker mode, sent as `actAs`).
- `lib/socket.ts` single socket; `send`/`act` wrap acks; re-sends `game:reconnect` on every connect. `lib/storage.ts` keeps seats/tokens per game code in localStorage (try/catch everywhere).
- `store/game.ts` (Zustand): public/private state (stale versions dropped), toasts, haptics on your turn / overdue / win.
- `pages/`: Home, CreateGame (`?group=<id>` → group rules + member picker), JoinGame (code / link / QR; group games show `MemberPicker`), GamePage → LobbyRoom | TableScreen | Results, PublicResults (`/r/:id`), GroupsPage (`/groups`), GroupPage (`/group/:id`). REST calls go through `lib/api.ts`.
- `components/table/`: TableView (oval, seats placed by `layout.ts`, markers, centre), Seat, YourHand, ActionDock (3 s Pack undo, long-press info), BetSheet, SideShowPrompt, DealPanel, RoundRecap. `components/physical/`: ComparisonSheet (only the picker chooses winners; others confirm/dispute read-only), CardPicker.
- All copy in `i18n/en.ts` (including the chat preset lines, `t.chat.presets`).
- Learning (Phase 5): `practice/localGame.ts` runs a whole game on the phone with the shared engine and feeds the normal stores (`send()` in `lib/socket.ts` routes to it while `code === LOCAL_CODE`), so the table UI is reused as-is. `practice/bots.ts` (strength-based bots, unit-tested with 200 bot-only games: `pnpm --filter @tpc/client test`), `practice/tutorial.ts` (scripted round, rigged deck, steps advance on engine events; only the coached move is allowed), `components/learn/` (Walkthrough on first launch, TutorialCoach). Pages: `/learn`, `/learn/glossary`, `/tutorial`, `/practice`. Coach and walkthrough numbers come from the engine.
- PWA: `public/manifest.webmanifest`, icons in `public/icons/` (regenerate with `node client/scripts/make-icons.mjs`), `public/sw.js` = offline shell (network-first pages, cache-first `/assets/`, never the game server) + push. Registered in production by `lib/pwa.ts` (also install prompt `useInstall`, `useWakeLock` on the table screen). Bump `SHELL` in sw.js when changing caching. New deploys: `watchForUpdates` in `lib/pwa.ts` compares the running `/assets/index-*.js` with the live `index.html` (on foreground + every 30 min) — reload away from tables, `UpdateBanner` at `/g`, `/practice`, `/tutorial`. The worker prunes `/assets/` no longer referenced and never caches HTML as an asset. `__BUILD_ID__` (Vercel commit) shows on Home; server `/health` has `build` (Render commit) and `push`.
- Web push: `server/src/push.ts` (VAPID from env; throwaway keys in dev; off in production without keys), subscriptions on `ServerPlayer.push` (never sent to clients), one push per new turn key / side-show ask / nudge. Client `lib/push.ts`, `public/sw.js` (skips the notification when a window is visible), `PushPrompt` (lobby, only after joining) and a menu toggle. Push needs a secure origin (not `http://<LAN IP>`).
- Chat: server keeps the last 200 messages on the game (`chat`, `chatSeq`), sends `chat` per message and `chat:history` on every bind (that is how missed messages arrive). Separate chat token bucket in `sockets.ts`. Client `store/chat.ts` (unread = typed messages from others since `tpc.chatRead`; floats for reactions/presets; mute in prefs), `components/chat/`.
- Dev on a phone: the client talks to `http(s)://<same host>:4000` unless `VITE_SERVER_URL` is set; Vite injects `__LAN_ORIGIN__` so QR codes work when the host opened `localhost`. The server allows private-LAN origins outside production.
- E2E: `pnpm test:e2e` (Playwright; starts `server dev:memory` on :4100 with in-memory Mongo and Vite on :5400). Screenshots land in `client/e2e/screens/` (git-ignored) — look at them after UI changes.

## Conventions

- Strict TypeScript (`noUncheckedIndexedAccess` on). ESM everywhere. Type-only imports use `import type`.
- Clients send **intents**; server validates turn, legality and amount with zod + engine, then broadcasts `state:public` to the room and `state:private` per socket. Never send another player's cards before a legal reveal.
- Digital and physical modes share one engine path; physical mode differs only in how `AWAITING_RESULT` is resolved.
- Chip amounts are integers. Settlement nets must sum to zero.
- All user-facing strings live in `client/src/i18n/` (English now, Hindi later).
- UI: mobile-first, `dvh` units, safe-area insets, min 48 px tap targets, reduced-motion support. Theme tokens (`felt`, `gold`, `ink`) are in `client/tailwind.config.ts`.
- Tests sit next to code as `*.test.ts`. Engine changes need tests (see SPEC §11).
- Don't run Prettier on `SPEC.md` (it's in `.prettierignore`).

## Env

- Server: `server/.env` from `server/.env.example` (`MONGODB_URI`, `CLIENT_ORIGIN`, `PORT`, `NODE_ENV`). Parsed by `server/src/config.ts`.
- Client: `client/.env` from `client/.env.example` (`VITE_SERVER_URL`).
