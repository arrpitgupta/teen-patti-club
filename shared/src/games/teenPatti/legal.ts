import { engineError, type EngineError } from '../../engine/types';
import type { PlayerId, RoundPhase, RoundPlayer, RoundState, TableState } from './types';

export type Check<T> = { ok: true; value: T } | { ok: false; error: EngineError };
const pass = <T>(value: T): Check<T> => ({ ok: true, value });
const deny = <T>(code: EngineError['code'], message: string): Check<T> => ({
  ok: false,
  error: engineError(code, message),
});

export interface BetRange {
  min: number;
  max: number;
  /** 1 for blind bets; 2 for seen bets (so the stake stays a whole number). */
  step: 1 | 2;
}

// ---------- Seating helpers ----------

export function activePlayers(r: RoundState): RoundPlayer[] {
  return r.players.filter((p) => !p.packed);
}

export function findPlayer(r: RoundState, id: PlayerId): RoundPlayer | undefined {
  return r.players.find((p) => p.id === id);
}

/** Next player still in, clockwise from `id` (works even if `id` has packed). */
export function nextActiveAfter(r: RoundState, id: PlayerId): PlayerId | null {
  const n = r.players.length;
  const idx = r.players.findIndex((p) => p.id === id);
  for (let i = 1; i < n; i++) {
    const p = r.players[(idx + i) % n]!;
    if (!p.packed) return p.id;
  }
  return null;
}

/** Previous player still in, counter-clockwise from `id`. */
export function prevActiveBefore(r: RoundState, id: PlayerId): PlayerId | null {
  const n = r.players.length;
  const idx = r.players.findIndex((p) => p.id === id);
  for (let i = 1; i < n; i++) {
    const p = r.players[(idx - i + n) % n]!;
    if (!p.packed) return p.id;
  }
  return null;
}

/** All round players, clockwise, starting with the player left of the dealer. */
export function orderFromDealer(r: RoundState): RoundPlayer[] {
  const idx = r.players.findIndex((p) => p.seat > r.dealerSeat);
  const start = idx === -1 ? 0 : idx;
  return [...r.players.slice(start), ...r.players.slice(0, start)];
}

// ---------- Rules ----------

export function canAfford(r: RoundState, p: RoundPlayer, amount: number): boolean {
  return r.rules.chipMode === 'openTab' || p.balance >= amount;
}

export function hasHitBlindLimit(r: RoundState, p: RoundPlayer): boolean {
  return !p.seen && r.rules.maxBlinds !== null && p.blindBets >= r.rules.maxBlinds;
}

/** Legal chaal amounts for this player right now (ignores whose turn it is). */
export function betRange(r: RoundState, p: RoundPlayer): Check<BetRange> {
  const { maxChaal, maxBlinds } = r.rules;
  let min: number;
  let max: number;
  let step: 1 | 2;
  if (!p.seen) {
    if (hasHitBlindLimit(r, p)) {
      return deny(
        'MUST_SEE',
        `You've played blind ${maxBlinds} times. Look at your cards to keep betting.`,
      );
    }
    min = r.stake;
    max = 2 * r.stake;
    if (maxChaal !== null) max = Math.min(max, maxChaal);
    step = 1;
  } else {
    min = 2 * r.stake;
    max = 4 * r.stake;
    if (maxChaal !== null) max = Math.min(max, 2 * maxChaal);
    step = 2;
  }
  if (r.rules.chipMode === 'buyIn') {
    max = Math.min(max, p.balance);
    if (step === 2 && max % 2 !== 0) max -= 1;
  }
  if (max < min) {
    return deny('INSUFFICIENT_CHIPS', `You need at least ${min} chips to bet. You can pack.`);
  }
  return pass({ min, max, step });
}

export function isValidBet(range: BetRange, amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= range.min &&
    amount <= range.max &&
    (amount - range.min) % range.step === 0
  );
}

export function betHint(range: BetRange): string {
  if (range.min === range.max) return `You can bet exactly ${range.min}.`;
  if (range.step === 2) return `You can bet ${range.min} to ${range.max} (even amounts only).`;
  return `You can bet ${range.min} to ${range.max}.`;
}

export function showCheck(
  r: RoundState,
  p: RoundPlayer,
): Check<{ cost: number; opponentId: PlayerId }> {
  const active = activePlayers(r);
  if (active.length !== 2) {
    return deny('ILLEGAL_ACTION', 'A show is only possible when two players are left.');
  }
  const opponent = active.find((x) => x.id !== p.id)!;
  let cost: number;
  if (!p.seen) {
    if (!r.rules.blindCanShow) {
      return deny('ILLEGAL_ACTION', "Blind players can't ask for a show in this game.");
    }
    if (hasHitBlindLimit(r, p)) {
      return deny('MUST_SEE', 'Look at your cards before asking for a show.');
    }
    cost = r.stake;
  } else {
    if (!opponent.seen) {
      return deny(
        'ILLEGAL_ACTION',
        'Your opponent is still blind, so only they can ask for a show.',
      );
    }
    cost = 2 * r.stake;
  }
  if (!canAfford(r, p, cost)) {
    return deny('INSUFFICIENT_CHIPS', `A show costs ${cost} chips.`);
  }
  return pass({ cost, opponentId: opponent.id });
}

export function sideShowCheck(
  r: RoundState,
  p: RoundPlayer,
): Check<{ cost: number; targetId: PlayerId }> {
  if (!p.seen) return deny('ILLEGAL_ACTION', 'Only seen players can ask for a side show.');
  if (activePlayers(r).length < 3) {
    return deny(
      'ILLEGAL_ACTION',
      'A side show needs at least 3 players still in. With 2 left, ask for a show.',
    );
  }
  const targetId = prevActiveBefore(r, p.id)!;
  if (!findPlayer(r, targetId)!.seen) {
    return deny('ILLEGAL_ACTION', "The previous player is blind, so a side show isn't allowed.");
  }
  const cost = 2 * r.stake;
  if (!canAfford(r, p, cost)) {
    return deny('INSUFFICIENT_CHIPS', `A side show costs ${cost} chips.`);
  }
  return pass({ cost, targetId });
}

// ---------- UI hints ----------

export interface LegalActions {
  inRound: boolean;
  phase: RoundPhase | null;
  isTurn: boolean;
  canSee: boolean;
  canPack: boolean;
  /** Legal chaal range. UI: "Chaal" = min, "Double" = max, slider for custom amounts. */
  bet: BetRange | null;
  betBlocked: 'MUST_SEE' | 'INSUFFICIENT_CHIPS' | null;
  sideShow: { cost: number; targetId: PlayerId } | null;
  show: { cost: number; opponentId: PlayerId } | null;
  canRespondSideShow: boolean;
  mustSee: boolean;
  /** Physical-mode result entry, when this player is part of a comparison. */
  result: {
    canPickWinner: boolean;
    canConfirm: boolean;
    canDispute: boolean;
    canEnterCards: boolean;
  } | null;
}

export function legalActions(t: TableState, playerId: PlayerId): LegalActions {
  const none: LegalActions = {
    inRound: false,
    phase: t.round?.phase ?? null,
    isTurn: false,
    canSee: false,
    canPack: false,
    bet: null,
    betBlocked: null,
    sideShow: null,
    show: null,
    canRespondSideShow: false,
    mustSee: false,
    result: null,
  };
  const r = t.round;
  const p = r ? findPlayer(r, playerId) : undefined;
  if (!r || !p || r.phase === 'ENDED') return none;

  const legal: LegalActions = { ...none, inRound: !p.packed };
  if (p.packed) return legal;

  legal.canSee = !p.seen && r.phase !== 'DEALING';
  legal.mustSee = hasHitBlindLimit(r, p);
  legal.isTurn = r.phase === 'BETTING' && r.turnId === p.id;

  if (legal.isTurn) {
    legal.canPack = true;
    const range = betRange(r, p);
    if (range.ok) legal.bet = range.value;
    else legal.betBlocked = range.error.code === 'MUST_SEE' ? 'MUST_SEE' : 'INSUFFICIENT_CHIPS';
    const show = showCheck(r, p);
    if (show.ok) legal.show = show.value;
    const side = sideShowCheck(r, p);
    if (side.ok) legal.sideShow = side.value;
  }

  legal.canRespondSideShow =
    r.phase === 'AWAITING_SIDESHOW_RESPONSE' && r.pendingSideShow?.targetId === p.id;

  const c = r.comparison;
  if (r.phase === 'AWAITING_RESULT' && c && c.playerIds.includes(p.id) && c.method !== 'auto') {
    const tap = c.method === 'tapWinner';
    legal.result = {
      canPickWinner: tap && c.proposal === null,
      canConfirm: tap && c.proposal !== null && !c.proposal.confirmedBy.includes(p.id),
      canDispute: tap,
      canEnterCards: c.method === 'enterCards',
    };
  }
  return legal;
}
