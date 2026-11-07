# Rules decisions

SPEC.md §4 defines the core rules. This file records how ambiguous points were decided (confirmed by the project owner before Phase 2). The engine in `shared/` implements exactly this; tests in `shared/src/games/teenPatti/*.test.ts` cover each point.

## Betting

- **Stake** is always in blind terms. Blind bets 1×–2× stake (new stake = bet). Seen bets 2×–4× stake (new stake = bet ÷ 2).
- Any **whole number** in the legal range is allowed. **Seen bets must be even** so the stake stays whole.
- **UI:** one-tap quick buttons — **Chaal** = minimum legal bet, **Double** = maximum legal bet. Slider only for custom amounts. (`legalActions().bet` gives `{ min, max, step }`.)
- **Max chaal caps the stake.** Blind players pay at most the cap; seen players at most 2× the cap.
- **Max blinds** counts blind bets in the current round. After N, a player must see before betting or asking for a show. They can always pack.
- **Pack** only on your own turn. **See cards** any time (except before physical cards are dealt); not a turn action; irreversible.
- **Turn timer** runs out → the player packs (or, if they were asked for a side show, it counts as deny). Timer off → the game waits.

## Show

- Only when exactly 2 players are still in. Allowed on the very first turn.
- Cost is fixed (no raising with a show): blind pays the stake, seen pays 2× the stake.
- A seen player can't ask for a show against a blind player. A blind player can ask against anyone (if "blind may request show" is on).
- Exact tie → the player who did **not** ask wins.

## Side show

- Requester must be seen; the previous player still in (counter-clockwise, skipping packed) must be seen; at least 3 players still in.
- Requester pays the minimum seen bet (2× stake) before the answer; no raising. Stake unchanged.
- Deny → play continues with the player after the requester. Asking again later is allowed.
- Accept → hands compared privately (only those two see each other's cards). Weaker hand packs. Tie → requester packs. Play continues with the player after the requester.

## Pot limit

- The bet that reaches or passes the limit is paid in full, then everyone still in shows (including blind players).
- If a side show request pushes the pot over the limit, it becomes the pot-limit show.
- If the boots alone reach the limit, the show happens straight away.
- Tied best hands split the pot. Any leftover chip goes to the first tied player clockwise from the dealer.

## Players and dealer

- 2–10 players. **Lobby hint: 3–7 is ideal** (`IDEAL_PLAYERS`).
- The first player to join (the host) deals the first round. The dealer moves one seat clockwise each round, skipping players who left or are sitting out.
- Players join any time (they play from the next round) and leave between rounds (or after packing). A player who left keeps their balance for settlement.

## Chip modes

- **Open tab (default):** everyone starts at 0. Balances may go negative without limit. Players always pay boot and bets.
- **Buy-in:** everyone starts with the buy-in. Balances never go below 0. A player who can't afford the minimum bet can only pack. A player who can't pay the boot sits out. The host can re-buy a player between rounds (adds the buy-in again; recorded).
- **Settlement:** net = final balance − (starting chips + re-buys). Nets always sum to zero. Payments: greedy, largest debtor pays largest creditor.

## Corrections

- **Host adjustments are always transfers** with a required reason: player→player between rounds; player↔player or player↔pot during a round. Buy-in players can't be taken below 0.
- **Undo** removes the last bet / pack / side-show request / side-show answer in the current round by replaying the action log (same deck, so identical state). Not allowed: undoing "see cards", after any cards were compared, or after the round ended. Requested by a player, approved by the host (server).
- **Cancel round** (e.g. ending the game mid-round) restores everyone's balance to before the round, including adjustments made during it.

## Physical mode

- No cards are stored. Betting starts when the host taps **Cards dealt**.
- **Tap winner / Hybrid:** one involved player picks the winner(s); **every other involved player must confirm**. Any dispute switches to **Enter cards**. Picking several players means a tie (the normal tie rule applies).
- **Enter cards:** each involved player picks 3 cards; cards picked by others are greyed out; the evaluator decides and explains.

## Hand rankings

Trail > Pure sequence > Sequence > Color > Pair > High card. A is high everywhere except in A-2-3.

- **A-2-3 "second highest" (default):** A-K-Q > A-2-3 > K-Q-J > … > 2-3-4.
- **A-2-3 "lowest":** A-K-Q > K-Q-J > … > 2-3-4 > A-2-3.
- K-A-2 is not a sequence. Suits never break ties.
