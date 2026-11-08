# Roadmap

SPEC.md §13 lists the core phases. This file records what was added or dropped after that.

## Decided against

- **Card scanning** (camera recognises physical cards): not planned.
- **Voice chat**: not planned. Players are usually at the same table; text chat covers remote play.

## Extras (built between Phase 4 and Phase 5, in this order)

1. **Table chat + quick reactions**: chat drawer with unread badge; emoji reactions and preset lines
   float over the sender's seat (~2 s); typed messages go to the drawer with a small toast. Saved with
   the game, rate-limited, max 300 characters, mute toggle per player, missed messages after reconnect.
2. **Rematch** on the End Game screen: same players and settings, one tap to rejoin.
3. **Nudge** the player to act (after 15 s on their turn, at most once per 20 s).
4. **House-rule presets**: save settings under a name, pick them when creating a game.
5. **Physical mode: "Enter my hand"** (optional): private entered cards, evaluator decides when every
   involved player entered, with confirm / dispute fallback.
6. **Remote play extras**: "your turn" web push, "Away" toggle (sit out without paying boot),
   voluntary "Show my cards" after a round, revealed hands in the round log.

All six are built. Then Phase 5 (Learning) and Phase 6 (Polish) as in SPEC.md, both built.

## Before Phase 7 (built)

7. **Permanent results link**: every game gets a long random id (not the join code); `/r/<id>` is a
   read-only page with podium, rankings, settlement and every round (incl. revealed and voluntarily
   shown hands). In the WhatsApp summary and on the End Game screen. "Best hand" only counts hands
   that were shown, since results are public.
8. **Saved groups**: a group has a name, a secret link (`/group/<id>`) and house rules stored on the
   server. Games started from the group attach to it and start with its rules; the group page shows
   games in progress, past games (→ results pages), a monthly and all-time leaderboard, and "New game
   with the group". Joining a group game offers "Who are you?" with the members' names; a typed
   name that matches a free member is that member, otherwise a new member is added.

## Phase 7 (Deploy)

Live on Vercel + Render + Atlas (see README → Deployment). Production checks: `/health` reports the
deployed commit and whether push is on; the client shows its version on Home; missing `/assets/*`
are 404s; open tabs pick up new deploys (auto-reload away from a table, "Reload" banner at one).

## Backlog (after Phase 6)

- Sentry error reporting + a "Report a problem" button.
- ~~Saved groups of friends + leaderboards across games.~~ Built (see 8).
- Results export (CSV / PDF). The results link covers sharing; a file export is still open.
