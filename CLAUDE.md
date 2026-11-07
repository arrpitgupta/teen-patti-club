# CLAUDE.md — Teen Patti Club

Real-time, mobile-first Teen Patti web app with **virtual chips only**. Full spec: [SPEC.md](SPEC.md) — read it before changing behaviour. Rule decisions that SPEC left open are in [docs/RULES.md](docs/RULES.md) and are binding. Work proceeds in the phases in SPEC §13; stop for user confirmation after each phase.

## Layout (pnpm workspaces)

- `shared/` (`@tpc/shared`) — pure TS engine: cards, evaluator, reducer `applyAction(state, action) -> { state, events }`, `GameDefinition` interface, comparison resolver, settlement, zod schemas. **No I/O, no `Date.now()`/`Math.random()` inside the reducer** — inject time and RNG so replay/undo is deterministic.
- `server/` (`@tpc/server`) — Express + Socket.io + Mongoose. Single source of truth. Live games in an in-memory `Map`, snapshotted to Mongo.
- `client/` (`@tpc/client`) — React + Vite + Tailwind + Framer Motion + Zustand + React Router. Imports `@tpc/shared` only for UI hints (legal moves, bet ranges); never decides outcomes.

`@tpc/shared` ships TypeScript source (`exports` → `src/index.ts`). Vite and tsx consume it directly; the server's tsup build inlines it (`noExternal`).

## Commands (run from repo root)

- `pnpm install`
- `pnpm dev` — server (:4000, tsx watch) + client (:5317) in parallel
- `pnpm test` — Vitest in shared + server · `pnpm --filter @tpc/shared test:watch`
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
