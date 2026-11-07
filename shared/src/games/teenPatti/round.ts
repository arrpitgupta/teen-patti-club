import { cardLabel, isCard, type Card } from '../../cards/cards';
import { deepClone } from '../../engine/clone';
import { engineError, type EngineError } from '../../engine/types';
import {
  describeHandValue,
  evaluateHand,
  explainComparison,
  type HandValue,
} from '../../evaluator/evaluator';
import {
  activePlayers,
  betHint,
  betRange,
  findPlayer,
  isValidBet,
  nextActiveAfter,
  orderFromDealer,
  showCheck,
  sideShowCheck,
} from './legal';
import type {
  Comparison,
  ComparisonReason,
  PlayerId,
  ResolutionMethod,
  RoundAction,
  RoundPlayer,
  RoundState,
  TeenPattiEvent,
  TeenPattiResult,
} from './types';

type Events = TeenPattiEvent[];
const err = engineError;

/** Apply one round action. Pure: returns a new state, never mutates `round`. */
export function applyRoundAction(
  round: RoundState,
  action: RoundAction,
): TeenPattiResult<RoundState> {
  const draft = deepClone(round);
  const events: Events = [];
  const error = reduce(draft, action, events);
  if (error) return { ok: false, error };
  draft.actions.push(deepClone(action));
  return { ok: true, state: draft, events };
}

/** Rebuild a round by replaying actions from its starting snapshot (used by undo). */
export function replayRound(initial: RoundState, actions: readonly RoundAction[]): RoundState {
  let r = initial;
  for (const a of actions) {
    const res = applyRoundAction(r, a);
    if (!res.ok) throw new Error(`Replay failed at ${a.type}: ${res.error.message}`);
    r = res.state;
  }
  return r;
}

/** Called once a round's cards are dealt: pot-limit check, then first turn. */
export function startBetting(r: RoundState, ev: Events): void {
  if (triggerPotLimit(r, ev)) return;
  const first = orderFromDealer(r).find((p) => !p.packed)!;
  r.turnId = first.id;
  ev.push({ type: 'TURN', playerId: first.id });
}

// ---------- Reducer ----------

const unknownPlayer = () => err('UNKNOWN_PLAYER', "That player isn't in this round.");

function reduce(r: RoundState, a: RoundAction, ev: Events): EngineError | null {
  if (r.phase === 'ENDED') return err('ROUND_OVER', 'This round is over.');

  switch (a.type) {
    case 'CARDS_DEALT': {
      if (r.phase !== 'DEALING') return err('ILLEGAL_ACTION', 'The cards have already been dealt.');
      r.phase = 'BETTING';
      ev.push({ type: 'CARDS_DEALT' });
      startBetting(r, ev);
      return null;
    }

    case 'SEE': {
      const p = findPlayer(r, a.playerId);
      if (!p) return unknownPlayer();
      if (r.phase === 'DEALING') return err('NOT_DEALT', 'Wait until the cards are dealt.');
      if (p.packed) return err('ILLEGAL_ACTION', "You've packed this round.");
      if (p.seen) return err('ALREADY_SEEN', "You've already seen your cards.");
      p.seen = true;
      ev.push({ type: 'SAW_CARDS', playerId: p.id });
      return null;
    }

    case 'CHAAL': {
      const p = findPlayer(r, a.playerId);
      const turnError = requireTurn(r, p);
      if (turnError || !p) return turnError ?? unknownPlayer();
      const range = betRange(r, p);
      if (!range.ok) return range.error;
      if (!isValidBet(range.value, a.amount)) return err('INVALID_AMOUNT', betHint(range.value));
      const blind = !p.seen;
      pay(r, p, a.amount);
      lockEnteredHand(p);
      if (blind) {
        r.stake = a.amount;
        p.blindBets += 1;
      } else {
        r.stake = a.amount / 2;
      }
      ev.push({ type: 'BET', playerId: p.id, amount: a.amount, blind, stake: r.stake, pot: r.pot });
      if (!triggerPotLimit(r, ev)) advanceTurn(r, p.id, ev);
      return null;
    }

    case 'PACK': {
      const p = findPlayer(r, a.playerId);
      const turnError = requireTurn(r, p);
      if (turnError || !p) return turnError ?? unknownPlayer();
      packPlayer(r, p, false, ev);
      return null;
    }

    case 'TIMEOUT': {
      const p = findPlayer(r, a.playerId);
      if (!p) return unknownPlayer();
      if (r.phase === 'BETTING' && r.turnId === p.id) {
        packPlayer(r, p, true, ev);
        return null;
      }
      if (r.phase === 'AWAITING_SIDESHOW_RESPONSE' && r.pendingSideShow?.targetId === p.id) {
        denySideShow(r, true, ev);
        return null;
      }
      return err('ILLEGAL_ACTION', 'Nothing is waiting on this player.');
    }

    case 'SIDESHOW_REQUEST': {
      const p = findPlayer(r, a.playerId);
      const turnError = requireTurn(r, p);
      if (turnError || !p) return turnError ?? unknownPlayer();
      const check = sideShowCheck(r, p);
      if (!check.ok) return check.error;
      const { cost, targetId } = check.value;
      pay(r, p, cost); // a normal seen bet; stake stays the same (cost / 2 = stake)
      lockEnteredHand(p);
      ev.push({ type: 'SIDESHOW_REQUESTED', playerId: p.id, targetId, amount: cost, pot: r.pot });
      if (triggerPotLimit(r, ev)) return null;
      r.phase = 'AWAITING_SIDESHOW_RESPONSE';
      r.pendingSideShow = { requesterId: p.id, targetId };
      return null;
    }

    case 'SIDESHOW_RESPOND': {
      const pending = r.pendingSideShow;
      if (r.phase !== 'AWAITING_SIDESHOW_RESPONSE' || !pending) {
        return err('ILLEGAL_ACTION', 'There is no side show to answer.');
      }
      if (pending.targetId !== a.playerId) {
        return err('NOT_YOUR_TURN', 'Only the player who was asked can answer the side show.');
      }
      if (!a.accept) {
        denySideShow(r, false, ev);
        return null;
      }
      ev.push({
        type: 'SIDESHOW_ACCEPTED',
        playerId: a.playerId,
        requesterId: pending.requesterId,
      });
      beginComparison(
        r,
        'sideshow',
        pending.requesterId,
        [pending.requesterId, pending.targetId],
        ev,
      );
      return null;
    }

    case 'SHOW': {
      const p = findPlayer(r, a.playerId);
      const turnError = requireTurn(r, p);
      if (turnError || !p) return turnError ?? unknownPlayer();
      const check = showCheck(r, p);
      if (!check.ok) return check.error;
      const { cost, opponentId } = check.value;
      pay(r, p, cost);
      lockEnteredHand(p);
      ev.push({ type: 'SHOW_REQUESTED', playerId: p.id, opponentId, amount: cost, pot: r.pot });
      beginComparison(r, 'show', p.id, [p.id, opponentId], ev);
      return null;
    }

    case 'RESULT_TAP_WINNER': {
      const c = requireComparison(r, a.playerId, ['tapWinner']);
      if ('code' in c) return c;
      if (c.proposal) return err('ILLEGAL_ACTION', 'A result is already waiting for confirmation.');
      const ids = [...new Set(a.winnerIds)];
      if (
        ids.length === 0 ||
        ids.length !== a.winnerIds.length ||
        !ids.every((id) => c.playerIds.includes(id))
      ) {
        return err('ILLEGAL_ACTION', 'Pick the winner from the players in this show.');
      }
      c.proposal = { by: a.playerId, winnerIds: ids, confirmedBy: [a.playerId] };
      ev.push({ type: 'RESULT_PROPOSED', playerId: a.playerId, winnerIds: ids });
      return null;
    }

    case 'RESULT_CONFIRM': {
      const c = requireComparison(r, a.playerId, ['tapWinner', 'entered']);
      if ('code' in c) return c;
      if (!c.proposal) return err('ILLEGAL_ACTION', 'Nobody has picked a winner yet.');
      if (c.proposal.confirmedBy.includes(a.playerId)) {
        return err('ILLEGAL_ACTION', "You've already confirmed.");
      }
      c.proposal.confirmedBy.push(a.playerId);
      ev.push({ type: 'RESULT_CONFIRMED', playerId: a.playerId });
      const proposal = c.proposal;
      if (c.playerIds.every((id) => proposal.confirmedBy.includes(id))) {
        const entered = c.method === 'entered';
        completeComparison(
          r,
          {
            winnerIds: proposal.winnerIds,
            hands: entered ? deepClone(c.enteredCards) : null,
            resolution: entered ? 'entered' : 'tapWinner',
          },
          ev,
        );
      }
      return null;
    }

    case 'RESULT_DISPUTE': {
      const c = requireComparison(r, a.playerId, ['tapWinner', 'entered']);
      if ('code' in c) return c;
      // Entered hands disputed: fall back to the normal flow. Tap-winner disputed: card picker.
      c.method = c.method === 'entered' ? physicalFallback(r) : 'enterCards';
      c.proposal = null;
      c.enteredCards = {};
      c.clash = false;
      ev.push({ type: 'RESULT_DISPUTED', playerId: a.playerId });
      return null;
    }

    case 'RESULT_ENTER_CARDS': {
      const c = requireComparison(r, a.playerId, ['enterCards']);
      if ('code' in c) return c;
      const cards = a.cards;
      if (cards.length !== 3 || !cards.every(isCard) || new Set(cards).size !== 3) {
        return err('INVALID_CARDS', 'Pick 3 different cards.');
      }
      const taken = new Set(
        Object.entries(c.enteredCards)
          .filter(([id]) => id !== a.playerId)
          .flatMap(([, cs]) => cs),
      );
      const clash = cards.find((x) => taken.has(x));
      if (clash) {
        return err('INVALID_CARDS', `${cardLabel(clash)} was already picked by another player.`);
      }
      c.enteredCards[a.playerId] = [...cards];
      ev.push({ type: 'RESULT_CARDS_ENTERED', playerId: a.playerId });
      if (c.playerIds.every((id) => c.enteredCards[id])) {
        const hands = deepClone(c.enteredCards);
        completeComparison(
          r,
          { winnerIds: topHands(r, hands, c.playerIds), hands, resolution: 'enterCards' },
          ev,
        );
      }
      return null;
    }

    case 'ENTER_HAND': {
      const p = findPlayer(r, a.playerId);
      if (!p) return unknownPlayer();
      if (r.rules.mode !== 'physical') {
        return err('ILLEGAL_ACTION', 'Entering your hand is only for games with real cards.');
      }
      if (r.phase === 'DEALING') return err('NOT_DEALT', 'Wait until the cards are dealt.');
      if (r.phase === 'AWAITING_RESULT') {
        return err('ILLEGAL_ACTION', 'Wait until the cards being compared are settled.');
      }
      if (p.packed) return err('ILLEGAL_ACTION', "You've packed this round.");
      if (p.handLocked) {
        return err('ILLEGAL_ACTION', "You've bet since entering your hand, so it can't change.");
      }
      const picked = a.cards;
      if (picked.length !== 3 || !picked.every(isCard) || new Set(picked).size !== 3) {
        return err('INVALID_CARDS', 'Pick 3 different cards.');
      }
      // Deliberately no check against other players' entered cards: any answer would leak them.
      p.hand = [...picked];
      p.entered = true;
      p.handLocked = false;
      if (!p.seen) {
        p.seen = true;
        ev.push({ type: 'SAW_CARDS', playerId: p.id });
      }
      ev.push({ type: 'HAND_ENTERED', playerId: p.id });
      return null;
    }

    case 'ADJUST':
      return adjustInRound(r, a, ev);
  }
}

/** Physical: betting with an entered hand fixes it (it could be edited until now). */
function lockEnteredHand(p: RoundPlayer): void {
  if (p.entered) p.handLocked = true;
}

/** The method a physical comparison uses when entered hands can't decide it. */
function physicalFallback(r: RoundState): ResolutionMethod {
  return r.rules.physicalResolution === 'enterCards' ? 'enterCards' : 'tapWinner';
}

// ---------- Helpers ----------

function requireTurn(r: RoundState, p: RoundPlayer | undefined): EngineError | null {
  if (!p) return unknownPlayer();
  switch (r.phase) {
    case 'DEALING':
      return err('NOT_DEALT', 'Wait until the cards are dealt.');
    case 'AWAITING_SIDESHOW_RESPONSE':
      return err('ILLEGAL_ACTION', 'Waiting for the side show answer.');
    case 'AWAITING_RESULT':
      return err('ILLEGAL_ACTION', 'Waiting for the cards to be compared.');
    default:
      break;
  }
  if (p.packed) return err('ILLEGAL_ACTION', "You've packed this round.");
  if (r.turnId !== p.id) return err('NOT_YOUR_TURN', "It's not your turn.");
  return null;
}

function requireComparison(
  r: RoundState,
  playerId: PlayerId,
  methods: ResolutionMethod[],
): Comparison | EngineError {
  const c = r.comparison;
  if (r.phase !== 'AWAITING_RESULT' || !c || c.method === 'auto') {
    return err('ILLEGAL_ACTION', 'There is no result to enter right now.');
  }
  if (!c.playerIds.includes(playerId)) {
    return err('ILLEGAL_ACTION', 'Only the players in this show can decide the result.');
  }
  if (!methods.includes(c.method)) {
    return err(
      'ILLEGAL_ACTION',
      c.method === 'enterCards'
        ? 'Enter your cards to settle this.'
        : c.method === 'entered'
          ? 'Confirm the result, or dispute it.'
          : 'Pick the winner, or dispute.',
    );
  }
  return c;
}

function pay(r: RoundState, p: RoundPlayer, amount: number): void {
  p.balance -= amount;
  p.contributed += amount;
  r.pot += amount;
}

function advanceTurn(r: RoundState, fromId: PlayerId, ev: Events): void {
  const next = nextActiveAfter(r, fromId);
  r.turnId = next;
  if (next) ev.push({ type: 'TURN', playerId: next });
}

function packPlayer(r: RoundState, p: RoundPlayer, timedOut: boolean, ev: Events): void {
  p.packed = true;
  ev.push({ type: 'PACKED', playerId: p.id, timedOut });
  const left = activePlayers(r);
  if (left.length === 1) endRound(r, [left[0]!.id], 'allPacked', null, ev);
  else advanceTurn(r, p.id, ev);
}

function denySideShow(r: RoundState, timedOut: boolean, ev: Events): void {
  const { requesterId, targetId } = r.pendingSideShow!;
  r.pendingSideShow = null;
  r.phase = 'BETTING';
  ev.push({ type: 'SIDESHOW_DENIED', playerId: targetId, requesterId, timedOut });
  advanceTurn(r, requesterId, ev);
}

function triggerPotLimit(r: RoundState, ev: Events): boolean {
  const limit = r.rules.potLimit;
  if (limit === null || r.pot < limit) return false;
  const ids = orderFromDealer(r)
    .filter((p) => !p.packed)
    .map((p) => p.id);
  if (ids.length < 2) return false;
  ev.push({ type: 'POT_LIMIT_REACHED', pot: r.pot, playerIds: ids });
  beginComparison(r, 'potLimit', null, ids, ev);
  return true;
}

// ---------- Comparison (pluggable resolver) ----------

interface ResolvedComparison {
  /** Players with the best hand (several = tie). */
  winnerIds: PlayerId[];
  hands: Record<PlayerId, Card[]> | null;
  resolution: ResolutionMethod;
}

export interface ComparisonResolver {
  /** Resolve now, or return null when the result must come from the players. */
  resolve(r: RoundState, c: Comparison): ResolvedComparison | null;
}

const digitalResolver: ComparisonResolver = {
  resolve(r, c) {
    const hands: Record<PlayerId, Card[]> = {};
    for (const id of c.playerIds) hands[id] = [...findPlayer(r, id)!.hand!];
    return { winnerIds: topHands(r, hands, c.playerIds), hands, resolution: 'auto' };
  },
};

const physicalResolver: ComparisonResolver = { resolve: () => null };

const RESOLVERS: Record<RoundState['rules']['mode'], ComparisonResolver> = {
  digital: digitalResolver,
  physical: physicalResolver,
};

function evaluateAll(r: RoundState, hands: Record<PlayerId, Card[]>): Record<PlayerId, HandValue> {
  const out: Record<PlayerId, HandValue> = {};
  for (const [id, cards] of Object.entries(hands)) {
    out[id] = evaluateHand(cards, { a23Rank: r.rules.a23Rank });
  }
  return out;
}

function topHands(r: RoundState, hands: Record<PlayerId, Card[]>, ids: PlayerId[]): PlayerId[] {
  const values = evaluateAll(r, hands);
  const best = Math.max(...ids.map((id) => values[id]!.score));
  return ids.filter((id) => values[id]!.score === best);
}

function beginComparison(
  r: RoundState,
  reason: ComparisonReason,
  requesterId: PlayerId | null,
  playerIds: PlayerId[],
  ev: Events,
): void {
  let method: ResolutionMethod = r.rules.mode === 'digital' ? 'auto' : physicalFallback(r);
  let proposal: Comparison['proposal'] = null;
  let enteredCards: Record<PlayerId, Card[]> = {};
  let clash = false;

  if (r.rules.mode === 'physical') {
    // "Enter my hand": if everyone involved entered, the evaluator can decide.
    const hands = playerIds.map((id) => findPlayer(r, id)!).filter((p) => p.entered && p.hand);
    if (hands.length === playerIds.length) {
      const all = hands.flatMap((p) => p.hand!);
      if (new Set(all).size !== all.length) {
        // Two players claim the same card. Ask everyone involved to re-check with the card
        // picker; nothing entered earlier is shown.
        method = 'enterCards';
        clash = true;
      } else {
        method = 'entered';
        enteredCards = Object.fromEntries(hands.map((p) => [p.id, [...p.hand!]]));
        proposal = {
          by: requesterId ?? playerIds[0]!,
          winnerIds: topHands(r, enteredCards, playerIds),
          confirmedBy: [],
        };
      }
    }
  }

  r.phase = 'AWAITING_RESULT';
  r.pendingSideShow = null;
  r.turnId = null;
  r.comparison = { reason, requesterId, playerIds, method, proposal, enteredCards, clash };
  ev.push({ type: 'COMPARISON_STARTED', reason, playerIds: [...playerIds], method });
  if (clash) ev.push({ type: 'HANDS_CLASH', playerIds: [...playerIds] });
  const outcome = RESOLVERS[r.rules.mode].resolve(r, r.comparison);
  if (outcome) completeComparison(r, outcome, ev);
}

function completeComparison(r: RoundState, outcome: ResolvedComparison, ev: Events): void {
  const c = r.comparison!;
  r.comparison = null;
  r.comparisonResolved = true;

  if (c.reason === 'sideshow') {
    const [requesterId, targetId] = c.playerIds as [PlayerId, PlayerId];
    const tie = outcome.winnerIds.length > 1;
    // On a tie the requester loses.
    const requesterWins = !tie && outcome.winnerIds[0] === requesterId;
    const winnerId = requesterWins ? requesterId : targetId;
    const loserId = requesterWins ? targetId : requesterId;
    findPlayer(r, loserId)!.packed = true;
    if (outcome.hands) {
      r.sideShowReveals.push({ viewerIds: [requesterId, targetId], hands: outcome.hands });
    }
    ev.push({ type: 'SIDESHOW_RESULT', winnerId, loserId, tie, resolution: outcome.resolution });
    r.phase = 'BETTING';
    advanceTurn(r, requesterId, ev);
    return;
  }

  if (c.reason === 'show') {
    const opponentId = c.playerIds[1]!;
    // On a tie the player who did not ask for the show wins.
    const winnerId = outcome.winnerIds.length === 1 ? outcome.winnerIds[0]! : opponentId;
    const tie = outcome.winnerIds.length > 1;
    endRound(r, [winnerId], 'show', outcome, ev, tie ? 'showTie' : null);
    return;
  }

  endRound(
    r,
    outcome.winnerIds,
    'potLimit',
    outcome,
    ev,
    outcome.winnerIds.length > 1 ? 'split' : null,
  );
}

function endRound(
  r: RoundState,
  winnerIds: PlayerId[],
  reason: 'allPacked' | 'show' | 'potLimit',
  outcome: ResolvedComparison | null,
  ev: Events,
  note: 'showTie' | 'split' | null = null,
): void {
  const order = orderFromDealer(r).map((p) => p.id);
  const winners = [...winnerIds].sort((x, y) => order.indexOf(x) - order.indexOf(y));
  const pot = r.pot;
  const share = Math.floor(pot / winners.length);
  const remainder = pot - share * winners.length;
  const payouts: Record<PlayerId, number> = {};
  winners.forEach((id, i) => {
    // Any leftover chip goes to the first winner clockwise from the dealer.
    const amount = share + (i === 0 ? remainder : 0);
    payouts[id] = amount;
    findPlayer(r, id)!.balance += amount;
  });
  r.pot = 0;

  let winningHand: string | null = null;
  let explanation: string | null = null;
  const hands = outcome?.hands ?? null;
  if (hands) {
    const values = evaluateAll(r, hands);
    const best = values[winners[0]!]!;
    winningHand = describeHandValue(best);
    if (note === 'showTie') {
      explanation =
        'the hands are equal, and on a tie the player who did not ask for the show wins';
    } else if (note === 'split') {
      explanation = 'the best hands are equal, so the pot is split';
    } else {
      const runnerUp = Object.entries(values)
        .filter(([id]) => !winners.includes(id))
        .map(([, v]) => v)
        .sort((x, y) => y.score - x.score)[0];
      explanation = runnerUp ? explainComparison(best, runnerUp) : null;
    }
  }

  r.result = {
    reason,
    winnerIds: winners,
    pot,
    payouts,
    revealedHands: hands ?? {},
    resolution: outcome?.resolution ?? null,
    winningHand,
    explanation,
  };
  r.phase = 'ENDED';
  r.turnId = null;
  r.comparison = null;
  r.pendingSideShow = null;
  ev.push({ type: 'ROUND_ENDED', result: deepClone(r.result) });
}

// ---------- Chip adjustments during a round ----------

export function checkAdjustmentBasics(a: {
  from: string;
  to: string;
  amount: number;
  reason: string;
}): EngineError | null {
  if (!Number.isInteger(a.amount) || a.amount <= 0) {
    return err('INVALID_ADJUSTMENT', 'The amount must be a whole number above 0.');
  }
  if (a.reason.trim().length === 0) return err('INVALID_ADJUSTMENT', 'Please give a reason.');
  if (a.from === a.to) return err('INVALID_ADJUSTMENT', 'Pick two different sides.');
  return null;
}

function adjustInRound(
  r: RoundState,
  a: Extract<RoundAction, { type: 'ADJUST' }>,
  ev: Events,
): EngineError | null {
  const basic = checkAdjustmentBasics(a);
  if (basic) return basic;
  const from = a.from === 'pot' ? null : findPlayer(r, a.from);
  const to = a.to === 'pot' ? null : findPlayer(r, a.to);
  if ((a.from !== 'pot' && !from) || (a.to !== 'pot' && !to)) {
    return err(
      'INVALID_ADJUSTMENT',
      'During a round, chips can only move between players in the round and the pot.',
    );
  }
  if (a.from === 'pot' && r.pot < a.amount) {
    return err('INVALID_ADJUSTMENT', "The pot doesn't have that many chips.");
  }
  if (from && r.rules.chipMode === 'buyIn' && from.balance < a.amount) {
    return err('INSUFFICIENT_CHIPS', "That player doesn't have that many chips.");
  }
  if (from) from.balance -= a.amount;
  else r.pot -= a.amount;
  if (to) to.balance += a.amount;
  else r.pot += a.amount;
  ev.push({
    type: 'CHIPS_ADJUSTED',
    from: a.from,
    to: a.to,
    amount: a.amount,
    reason: a.reason.trim(),
  });
  return null;
}
