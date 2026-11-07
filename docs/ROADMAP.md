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

Then Phase 5 (Learning) and Phase 6 (Polish) as in SPEC.md.

## Backlog (after Phase 6)

- Sentry error reporting + a "Report a problem" button.
- Saved groups of friends + leaderboards across games.
- Results export.
