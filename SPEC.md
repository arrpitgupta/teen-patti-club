# Teen Patti Tracker — Project Spec

Build a real-time, mobile-first web app for playing Teen Patti with friends **for fun, with virtual chips only**. No real money is handled by the app. The app runs the game (turns, bets, pot, rules), tracks every round, and when the group taps **End Game** it shows the final rankings and exactly **who owes whom**, so friends can settle up however they like.

The app must work for two kinds of tables:

1. **Digital cards** — the app deals cards to each player's phone.
2. **Physical cards** — friends sit together with a real deck; the app only handles betting, turns, maths and settlement.

It must be understandable by someone who has **never played Teen Patti**, and it must look and feel great on **phones and tablets**.

Read this whole file before writing code. Build in the phases at the end, and **stop for my confirmation after each phase**.

---

## 1. Tech stack

- **Monorepo** with pnpm workspaces:
  - `/shared` — TypeScript game engine, types, rules, evaluator, settlement. Pure functions, no I/O.
  - `/server` — Node.js 20 + Express + Socket.io + Mongoose, TypeScript.
  - `/client` — React + Vite + TypeScript + Tailwind CSS + Framer Motion + Zustand (state) + React Router.
- **Database:** MongoDB Atlas (free tier) via Mongoose.
- **Testing:** Vitest for `/shared` and `/server`; Playwright smoke test for the client (later phase).
- **Deployment:** client on **Vercel**, server on **Render** (Vercel serverless cannot hold WebSocket connections), DB on MongoDB Atlas.
- Lint/format: ESLint + Prettier. Strict TypeScript everywhere.

## 2. Architecture

- **Server is the single source of truth.** Clients only send *intents* (`{ type: "CHAAL", amount: 40 }`). The server validates turn, legality and amount, applies it via the shared engine, then broadcasts the new state.
- **Shared engine** is a pure reducer: `applyAction(state, action) -> { state, events }`. The same engine code runs on the server and is imported by the client only for UI hints (legal moves, min/max bets). The client never decides outcomes.
- **Pluggable game definitions:** structure the engine with a `GameDefinition` interface (setup, legal actions, apply action, round end) so other card games can be added later. Teen Patti is the first implementation.
- **Pluggable comparison resolver:** when cards must be compared (side show, show, pot-limit show) the engine enters `AWAITING_RESULT`.
  - Digital mode: the server resolves instantly by evaluating stored hands.
  - Physical mode: resolved by player input (see §4.4).
  Everything else is shared code; do **not** build two separate game paths.
- **Real-time:** Socket.io, one socket room per game. Each client receives:
  - the **public table state** (seats, balances, pot, stake, statuses, turn, timer, log), and
  - its **own private state** only (its cards in digital mode).
  Never emit another player's cards until a legal reveal.
- **Live state in memory, persisted to Mongo:** active games live in a server-side `Map`. After every applied action, write a snapshot to Mongo (debounced ~300 ms, and immediately at round end). On server boot, reload all `status: "active"` games from Mongo so a restart or redeploy does not lose a game.
- **No accounts required:** players join with a display name and avatar. On join, the server issues a random `playerToken` stored in `localStorage`. On reconnect, the client sends `{ gameCode, playerToken }` and gets its seat back with full state restored.
- **Render free tier sleeps:** the client pings `GET /health` when the home screen loads and shows a friendly "Waking up the table…" state if the server is cold.

## 3. Game structure

- **Game** — one sitting. Has a 6-character join code, a host, settings, players and many rounds.
- **Round** — one deal. Pot goes to the winner; balances update live.
- **End Game** — host taps End Game (with confirmation). Shows the results screen (§7).
- Players can join between rounds. A player can leave between rounds; their balance is kept for settlement.
- Host can transfer host role, kick a player (between rounds), pause the game.

### Game settings (chosen at creation, editable between rounds by host)

| Setting | Default |
|---|---|
| Mode | Digital / Physical |
| Starting chips per player | 0 (balances go negative) — or a fixed buy-in |
| Boot amount | 10 |
| Max chaal (max single bet) | 1280 (or "no limit") |
| Pot limit (forces show) | 10240 (or "no limit") |
| Max consecutive blind rounds per player | 4 (or "no limit") |
| A-2-3 sequence rank | Second highest (after A-K-Q) / Lowest |
| Blind player may request show | Yes |
| Turn timer | 30 s / 60 s / Off (default Off in physical mode) |
| Physical-mode result method | Tap winner / Enter cards / Hybrid |
| Chip-to-rupee rate (display only) | Off, or e.g. 1 chip = ₹1 |

## 4. Teen Patti rules (encode exactly)

### 4.1 Round flow
1. Dealer button rotates clockwise each round. Every seated player pays the **boot** into the pot.
2. Digital: server shuffles (Fisher–Yates with `crypto.randomInt`) and deals 3 cards each. Physical: host taps **"Cards dealt"**.
3. All players start **blind**. The **current stake** starts at the boot.
4. Turns go clockwise starting left of the dealer. Folded players are skipped.
5. Round ends when one player remains, or a show is resolved, or the pot limit triggers a show.

### 4.2 Actions
- **See cards** — any time, not a turn action, irreversible. Player becomes **seen**. (Physical mode: "I've looked at my cards".)
- **Blind bet (chaal)** — blind player bets **1× to 2× the current stake**. New stake = the amount bet.
- **Seen bet (chaal)** — seen player bets **2× to 4× the current stake**. New stake = amount ÷ 2.
- Bets are capped by max chaal. Bet amounts must be whole numbers.
- **Fold (pack)** — player is out for the round and loses what they put in.
- **Side show** — requester must be **seen**, the previous active player (counter-clockwise) must also be **seen**, and at least **3** players must still be in. Requester pays a normal seen bet. The other player gets **Accept / Deny**.
  - Deny: play continues to the next player.
  - Accept: the two hands are compared privately (only those two see each other's cards). The weaker hand folds. **On a tie, the requester folds.**
- **Show** — only when exactly **2** players remain. Requester pays a normal bet for their status (blind: stake; seen: 2× stake). Both hands revealed; higher wins. On an exact tie, the player who did **not** ask for the show wins. If "blind may request show" is off, only seen players can request it. A seen player cannot request show against a blind player (the blind player decides).
- **Pot limit** — if the pot reaches the limit, an automatic show among all remaining players happens.
- **Max blinds** — after N blind turns, a player must see before betting again.

### 4.3 Hand rankings (high → low)
1. **Trail / Set** — three of a kind (AAA highest, 222 lowest)
2. **Pure sequence** — straight flush
3. **Sequence** — straight
4. **Color** — flush
5. **Pair** — compare pair rank, then kicker
6. **High card** — compare highest, then next, then next

Sequences: A-K-Q highest; A-2-3 rank per setting; K-A-2 is **not** a sequence. Suits never break ties. Implement a numeric score so hands compare with a single comparison, and expose `describeHand(cards)` returning a friendly name like "Pair of Kings".

### 4.4 Physical mode resolution
When the engine is `AWAITING_RESULT`, show a full-screen sheet to the involved players:
- **Tap winner:** one player selects the winner; the other involved player must confirm. If they disagree, switch to Enter cards.
- **Enter cards:** each involved player picks their 3 cards on a 4×13 card-picker grid (cards already chosen by others greyed out). The evaluator decides and displays both hands and why one won.
- **Hybrid (default):** tap winner, with a **Dispute** button that switches to Enter cards.
For a pot-limit show with several players, use the same flow for all remaining players.

### 4.5 Corrections
- **Undo last action** — requested by any player, approved by the host. Implement by replaying the action log without the last action.
- **Host chip adjustment** — host can add/subtract chips to a player with a required reason.
Both are recorded in the log and shown to everyone.

## 5. Control modes
- **Own phone (default):** each player joins with the code (or QR code) and controls their seat.
- **Banker mode:** the host can add "offline seats" (players without a phone) and take actions for them. A game can mix both.
- Optional **single-device mode:** one tablet in the middle controls every seat; show a big "Pass to Neha" screen between turns (cards hidden in digital mode until she taps).

## 6. Learning: built for first-time players
Someone who has never played must be able to play their first round confidently.

- **"How to play" walkthrough** on first launch (skippable, re-openable from menu): 5–6 swipeable illustrated cards covering: goal, boot and pot, blind vs seen, betting, side show and show, hand rankings.
- **Interactive tutorial round:** a scripted practice round against 3 bots that pauses at each step with a coach bubble ("You're blind, so you can bet 10–20. Tap Chaal").
- **Practice mode:** digital game vs simple bots (bots bet based on hand strength with some randomness) so people can learn alone.
- **Hand rankings cheat sheet** always one tap away (bottom sheet) with example cards for each rank, and in digital mode **highlight the player's current hand** in it.
- **Contextual hints on the table** (toggleable): a line above the action bar that explains the current situation in plain words, e.g. "Current stake is 20. As a seen player you can bet 40–80."
- Every action button has a long-press / ⓘ tooltip explaining what it does and what it costs.
- Digital mode: show the player's hand name under their cards ("Sequence: 5-6-7").
- After every round, a short **round recap**: who won, with what hand (if revealed), pot size, and a one-line explanation ("Aman's Color beat Rohit's Pair of Kings, because Color ranks above Pair" — always generated from the evaluator).
- Glossary page: Boot, Chaal, Blind, Seen, Pack, Side show, Show, Trail, etc.
- All copy in simple English; structure strings in an i18n file so Hindi can be added later.

## 7. End Game screen
- **Podium** animation for the top 3, then the full ranking sorted by net chips.
- Per player: net +/−, rounds played, rounds won, biggest pot won, best hand (digital mode).
- **Settlement:** minimum list of payments using greedy matching of largest debtor with largest creditor ("Rohit pays Aman 340 chips (₹340)"). Show both chips and rupees if a rate is set.
- **Share** button: copy a formatted text summary and open WhatsApp share (`https://wa.me/?text=`). Also "Save as image" using `html-to-image`.
- Game is saved; viewable later from **History**.
- Nets must always sum to zero (unit test this).

## 8. UI / UX (this matters a lot)
Mostly used on phones and tablets around a real table. Make it feel like a premium card-game app.

- **Mobile-first**, then tablet. Support portrait (primary) and landscape. Tablet landscape gets a wide oval table.
- **Visual style:** dark green felt table with subtle texture and vignette, warm gold accents, clean modern sans-serif (e.g. Inter or Poppins via Google Fonts), high-contrast numbers. Avoid a generic template look.
- **Table layout:** oval table, players seated around it with avatar, name, chip balance, status chip (Blind / Seen / Packed), and a circular **turn timer ring** around the active player's avatar. Pot and current stake in the center. Dealer button chip visible.
- **Your area (bottom):** your 3 cards large and face-down, tap/swipe up to **flip with a 3D animation** (digital). Below: a sticky **action bar** with big thumb-friendly buttons (min 48 px): Pack, Chaal (shows exact amount), Raise (opens a slider snapped to legal amounts with quick chips like 2× / 3× / 4×), Side show, Show. Only legal actions are enabled.
- **Animations (Framer Motion):** dealing cards sliding to seats, chips flying to the pot, pot flying to the winner, confetti on round win, smooth balance count-up.
- **Feedback:** sound effects (deal, chip, win) with a mute toggle, haptics via `navigator.vibrate` on your turn and on win, toast for other players' actions ("Neha raised to 80").
- **Your turn** must be unmistakable: glow on your seat, vibration, action bar slides up.
- Keep the screen awake during a game (Screen Wake Lock API).
- **PWA:** installable, app icon, splash screen, fullscreen, offline shell.
- Respect safe-area insets (notches). No horizontal scroll. Use `dvh` units.
- **Accessibility:** readable font sizes, color is never the only signal, reduced-motion support, proper button labels.
- **Lobby:** big Create Game / Join Game buttons; join by code or by scanning a **QR code** shown on the host's screen; pick name and avatar (emoji or generated avatar).
- **Game log** drawer: chronological list of every action with timestamps.
- Light, friendly empty and loading states. Clear error messages ("It's not your turn").

## 9. Data models (Mongoose)
- **Game**: `code` (unique, indexed), `hostPlayerId`, `mode`, `settings`, `status` (`lobby | active | ended`), `players[]` (`id`, `name`, `avatar`, `tokenHash`, `isOffline`, `seat`, `balance`, `joinedAt`, `leftAt`), `currentRoundState` (engine snapshot, private cards stored server-side only), `createdAt`, `updatedAt`, `endedAt`, `results` (rankings + settlement).
  - TTL: delete games in `lobby` status after 24 h of inactivity.
- **Round**: `gameId` (indexed), `roundNumber`, `dealerSeat`, `boot`, `pot`, `winnerIds`, `winningHand`, `revealedHands`, `actions[]` (`playerId`, `type`, `amount`, `stakeAfter`, `potAfter`, `at`), `resolution` (`auto | tapWinner | enterCards`), `startedAt`, `endedAt`.
- **Group** (optional, later): saved group of friends for leaderboards across games.
- Store `playerToken` only as a hash.

## 10. Socket events
Client → server: `game:create`, `game:join`, `game:reconnect`, `game:updateSettings`, `game:start`, `round:start`, `round:cardsDealt`, `action:see`, `action:chaal`, `action:pack`, `action:sideshowRequest`, `action:sideshowRespond`, `action:show`, `result:tapWinner`, `result:confirm`, `result:dispute`, `result:enterCards`, `undo:request`, `undo:approve`, `host:adjustChips`, `host:kick`, `host:transfer`, `game:end`.
Server → client: `state:public`, `state:private`, `event` (for toasts/animations), `error`.
Validate every payload with **zod** schemas in `/shared`. Rate-limit events per socket.

REST: `GET /health`, `GET /api/games/:code` (public summary), `GET /api/games/:code/rounds`, `GET /api/history` (games for a set of player tokens).

## 11. Testing
Vitest in `/shared` must cover:
- Every hand rank and every tie-break, including A-K-Q vs A-2-3 settings and K-A-2 not being a sequence.
- Blind/seen stake maths and min/max bet limits, max chaal, max blinds.
- Side show eligibility, accept/deny, tie (requester loses).
- Show eligibility and tie rule; pot-limit auto show.
- Fold until one remains; turn order skipping folded players; dealer rotation.
- Undo by replay produces identical state.
- Settlement: nets sum to zero; payment list is minimal and correct for random inputs (property test).
Server: integration tests with a Socket.io client for create → join → play round → end game, reconnection, and that private cards never leak to other sockets.

## 12. Repo, env and deployment
- Root README: what the app is, screenshots placeholder, local setup, scripts, deployment guide.
- `.env.example` for server: `MONGODB_URI`, `CLIENT_ORIGIN`, `PORT`, `NODE_ENV`. For client: `VITE_SERVER_URL`.
- CORS and Socket.io allowed origin = `CLIENT_ORIGIN`.
- Deployment steps in README:
  1. MongoDB Atlas: free M0 cluster, DB user, network access, connection string.
  2. Render: Web Service from `/server`, build and start commands, env vars, health check path `/health`.
  3. Vercel: project root `/client`, `VITE_SERVER_URL` env var, SPA rewrite to `index.html`.
- Also create a `CLAUDE.md` with project conventions and commands so future sessions have context.

## 13. Build phases (stop and wait for my confirmation after each)
1. **Scaffold** — monorepo, tooling, folder structure, CLAUDE.md, README skeleton.
2. **Engine** — `/shared`: cards, deck, evaluator, betting state machine, comparison resolver, settlement, zod schemas, full tests. Most important phase; make it rock solid.
3. **Server** — Express + Socket.io, game lifecycle, persistence and restore, reconnection, integration tests.
4. **Client core** — lobby, join (code + QR), table screen, action bar, live updates, physical mode flow, end-game screen.
5. **Learning** — walkthrough, tutorial round, bots/practice mode, cheat sheet, hints, glossary.
6. **Polish** — animations, sounds, haptics, PWA, wake lock, tablet layout, accessibility, history.
7. **Deploy** — Atlas, Render, Vercel, end-to-end check on a real phone.

At the start of each phase, briefly state the plan; at the end, summarise what was built, how to run it, and anything I should test manually.
