import { isCard, type Card } from '../../cards/cards';
import { deepClone } from '../../engine/clone';
import { engineError, type EngineErrorCode } from '../../engine/types';
import { applyRoundAction, checkAdjustmentBasics, replayRound, startBetting } from './round';
import { MAX_PLAYERS, SettingsSchema, type Settings } from './settings';
import type {
  PlayerId,
  RoundAction,
  RoundPlayer,
  RoundRules,
  RoundState,
  TableAction,
  TableState,
  TeenPattiEvent,
  TeenPattiResult,
} from './types';

const fail = (code: EngineErrorCode, message: string): TeenPattiResult<TableState> => ({
  ok: false,
  error: engineError(code, message),
});

const ROUND_ACTIONS = new Set<RoundAction['type']>([
  'CARDS_DEALT',
  'SEE',
  'CHAAL',
  'PACK',
  'TIMEOUT',
  'SIDESHOW_REQUEST',
  'SIDESHOW_RESPOND',
  'SHOW',
  'RESULT_TAP_WINNER',
  'RESULT_CONFIRM',
  'RESULT_DISPUTE',
  'RESULT_ENTER_CARDS',
  'ENTER_HAND',
]);

/** Actions that UNDO may remove. "See cards" is irreversible; adjustments have their own log. */
const UNDOABLE = new Set<RoundAction['type']>([
  'CHAAL',
  'PACK',
  'TIMEOUT',
  'SIDESHOW_REQUEST',
  'SIDESHOW_RESPOND',
]);

export function createTable(settings: Settings): TableState {
  const parsed = SettingsSchema.safeParse(settings);
  if (!parsed.success) throw new Error(`Invalid settings: ${parsed.error.message}`);
  return {
    settings: parsed.data,
    players: [],
    dealerSeat: null,
    roundNumber: 0,
    round: null,
    roundInitial: null,
    corrections: [],
  };
}

export function isRoundInProgress(t: TableState): boolean {
  return t.round !== null && t.round.phase !== 'ENDED';
}

export interface RoundPlan {
  dealerSeat: number;
  /** Players in this round, clockwise starting left of the dealer (dealer last). */
  order: PlayerId[];
}

/** Who would play the next round, and who deals. null if fewer than 2 can play. */
export function planNextRound(t: TableState): RoundPlan | null {
  const { chipMode, boot } = t.settings;
  const eligible = t.players.filter(
    (p) => p.present && !p.away && (chipMode === 'openTab' || p.balance >= boot),
  );
  if (eligible.length < 2) return null;
  const bySeat = [...eligible].sort((a, b) => a.seat - b.seat);

  let dealerSeat: number;
  if (t.dealerSeat === null) {
    // First round: the first player who joined (the host) deals, if they can play.
    dealerSeat = eligible[0]!.seat;
  } else {
    const prev = t.dealerSeat;
    dealerSeat = (bySeat.find((p) => p.seat > prev) ?? bySeat[0]!).seat;
  }
  const idx = bySeat.findIndex((p) => p.seat === dealerSeat);
  const order = [...bySeat.slice(idx + 1), ...bySeat.slice(0, idx + 1)].map((p) => p.id);
  return { dealerSeat, order };
}

function rulesFrom(s: Settings): RoundRules {
  return {
    mode: s.mode,
    chipMode: s.chipMode,
    boot: s.boot,
    maxChaal: s.maxChaal,
    potLimit: s.potLimit,
    maxBlinds: s.maxBlinds,
    a23Rank: s.a23Rank,
    blindCanShow: s.blindCanShow,
    physicalResolution: s.physicalResolution,
  };
}

function syncBalances(t: TableState): void {
  if (!t.round) return;
  for (const rp of t.round.players) {
    const tp = t.players.find((p) => p.id === rp.id);
    if (tp) tp.balance = rp.balance;
  }
}

function isFullDeck(deck: readonly unknown[] | undefined): deck is Card[] {
  return !!deck && deck.length === 52 && deck.every(isCard) && new Set(deck).size === 52;
}

/** Apply any action to the table. Pure: never mutates `state`. */
export function applyAction(state: TableState, action: TableAction): TeenPattiResult<TableState> {
  const t = deepClone(state);
  const events: TeenPattiEvent[] = [];
  const done = (): TeenPattiResult<TableState> => ({ ok: true, state: t, events });

  if (ROUND_ACTIONS.has(action.type as RoundAction['type'])) {
    if (!isRoundInProgress(t)) return fail('NO_ROUND', 'No round is being played right now.');
    const res = applyRoundAction(t.round!, action as RoundAction);
    if (!res.ok) return res;
    t.round = res.state;
    events.push(...res.events);
    syncBalances(t);
    return done();
  }

  switch (action.type) {
    case 'ADD_PLAYER': {
      if (action.playerId === 'pot' || action.playerId.length === 0) {
        return fail('ILLEGAL_ACTION', 'That player id is not allowed.');
      }
      const present = t.players.filter((p) => p.present);
      const taken = new Set(present.map((p) => p.seat));
      const existing = t.players.find((p) => p.id === action.playerId);
      if (existing?.present) return fail('ALREADY_SEATED', "You're already at the table.");
      if (present.length >= MAX_PLAYERS) {
        return fail('TABLE_FULL', `The table is full (${MAX_PLAYERS} players).`);
      }
      const wanted = action.seat ?? existing?.seat;
      let seat: number;
      if (wanted !== undefined && wanted >= 0 && wanted < MAX_PLAYERS && !taken.has(wanted)) {
        seat = wanted;
      } else if (action.seat !== undefined) {
        return fail('ILLEGAL_ACTION', 'That seat is not available.');
      } else {
        seat = [...Array(MAX_PLAYERS).keys()].find((s) => !taken.has(s))!;
      }
      if (existing) {
        existing.present = true;
        existing.seat = seat;
      } else {
        const chips = t.settings.startingChips;
        t.players.push({
          id: action.playerId,
          seat,
          balance: chips,
          totalBuyIn: chips,
          present: true,
        });
      }
      events.push({ type: 'PLAYER_JOINED', playerId: action.playerId, seat });
      return done();
    }

    case 'REMOVE_PLAYER': {
      const tp = t.players.find((p) => p.id === action.playerId);
      if (!tp || !tp.present) return fail('UNKNOWN_PLAYER', "That player isn't at the table.");
      const inRound = t.round?.players.find((p) => p.id === action.playerId);
      if (isRoundInProgress(t) && inRound && !inRound.packed) {
        return fail('ROUND_IN_PROGRESS', 'You can leave after this round.');
      }
      tp.present = false;
      events.push({ type: 'PLAYER_LEFT', playerId: tp.id });
      return done();
    }

    case 'START_ROUND': {
      if (isRoundInProgress(t))
        return fail('ROUND_IN_PROGRESS', 'A round is already being played.');
      const plan = planNextRound(t);
      if (!plan) {
        return fail(
          'NOT_ENOUGH_PLAYERS',
          'At least 2 players with enough chips are needed to start.',
        );
      }
      const s = t.settings;
      const digital = s.mode === 'digital';
      if (digital && !isFullDeck(action.deck)) {
        return fail('INVALID_DECK', 'Digital mode needs a full shuffled deck.');
      }

      const startBalances: Record<PlayerId, number> = {};
      const players: RoundPlayer[] = t.players
        .filter((p) => plan.order.includes(p.id))
        .sort((a, b) => a.seat - b.seat)
        .map((p) => {
          startBalances[p.id] = p.balance;
          return {
            id: p.id,
            seat: p.seat,
            balance: p.balance - s.boot,
            contributed: s.boot,
            seen: false,
            packed: false,
            blindBets: 0,
            hand: null,
            entered: false,
            handLocked: false,
          };
        });

      if (digital) {
        // Deal one card at a time, starting left of the dealer.
        const deck = action.deck!;
        let k = 0;
        for (const p of players) p.hand = [];
        for (let i = 0; i < 3; i++) {
          for (const id of plan.order) players.find((p) => p.id === id)!.hand!.push(deck[k++]!);
        }
      }

      const round: RoundState = {
        roundNumber: t.roundNumber + 1,
        dealerSeat: plan.dealerSeat,
        rules: rulesFrom(s),
        players,
        pot: s.boot * players.length,
        stake: s.boot,
        turnId: null,
        phase: digital ? 'BETTING' : 'DEALING',
        pendingSideShow: null,
        comparison: null,
        sideShowReveals: [],
        comparisonResolved: false,
        actions: [],
        result: null,
        startBalances,
      };
      events.push({
        type: 'ROUND_STARTED',
        roundNumber: round.roundNumber,
        dealerSeat: round.dealerSeat,
        playerIds: [...plan.order],
        boot: s.boot,
        pot: round.pot,
      });
      if (digital) {
        events.push({ type: 'CARDS_DEALT' });
        startBetting(round, events);
      }
      t.round = round;
      t.roundInitial = deepClone(round);
      t.roundNumber = round.roundNumber;
      t.dealerSeat = round.dealerSeat;
      syncBalances(t);
      return done();
    }

    case 'CANCEL_ROUND': {
      if (!isRoundInProgress(t)) return fail('NO_ROUND', 'No round is being played right now.');
      const r = t.round!;
      // Everyone gets back exactly what they had before the round (including any
      // adjustments made during it).
      for (const p of r.players) p.balance = r.startBalances[p.id]!;
      r.result = {
        reason: 'cancelled',
        winnerIds: [],
        pot: r.pot,
        payouts: {},
        revealedHands: {},
        resolution: null,
        winningHand: null,
        explanation: null,
      };
      r.pot = 0;
      r.phase = 'ENDED';
      r.turnId = null;
      r.comparison = null;
      r.pendingSideShow = null;
      syncBalances(t);
      events.push({ type: 'ROUND_CANCELLED', roundNumber: r.roundNumber });
      return done();
    }

    case 'REBUY': {
      if (t.settings.chipMode !== 'buyIn') {
        return fail('ILLEGAL_ACTION', 'Re-buys are only used in buy-in games.');
      }
      if (isRoundInProgress(t)) return fail('ROUND_IN_PROGRESS', 'Re-buy between rounds.');
      const tp = t.players.find((p) => p.id === action.playerId);
      if (!tp) return fail('UNKNOWN_PLAYER', "That player isn't at the table.");
      const amount = t.settings.startingChips;
      tp.balance += amount;
      tp.totalBuyIn += amount;
      t.corrections.push({ type: 'REBUY', playerId: tp.id, amount });
      events.push({ type: 'REBUY', playerId: tp.id, amount });
      return done();
    }

    case 'ADJUST': {
      const basic = checkAdjustmentBasics(action);
      if (basic) return { ok: false, error: basic };
      const correction = {
        type: 'ADJUST' as const,
        roundNumber: isRoundInProgress(t) ? t.roundNumber : null,
        from: action.from,
        to: action.to,
        amount: action.amount,
        reason: action.reason.trim(),
      };
      if (isRoundInProgress(t)) {
        const res = applyRoundAction(t.round!, { ...action, reason: correction.reason });
        if (!res.ok) return res;
        t.round = res.state;
        events.push(...res.events);
        syncBalances(t);
      } else {
        const from = t.players.find((p) => p.id === action.from);
        const to = t.players.find((p) => p.id === action.to);
        if (!from || !to) {
          return fail(
            'INVALID_ADJUSTMENT',
            'Between rounds, chips can only move between two players.',
          );
        }
        if (t.settings.chipMode === 'buyIn' && from.balance < action.amount) {
          return fail('INSUFFICIENT_CHIPS', "That player doesn't have that many chips.");
        }
        from.balance -= action.amount;
        to.balance += action.amount;
        events.push({
          type: 'CHIPS_ADJUSTED',
          from: action.from,
          to: action.to,
          amount: action.amount,
          reason: correction.reason,
        });
      }
      t.corrections.push(correction);
      return done();
    }

    case 'UPDATE_SETTINGS': {
      if (isRoundInProgress(t)) return fail('ROUND_IN_PROGRESS', 'Change settings between rounds.');
      const parsed = SettingsSchema.safeParse(action.settings);
      if (!parsed.success) {
        return fail('INVALID_SETTINGS', parsed.error.issues[0]?.message ?? 'Invalid settings.');
      }
      const next = parsed.data;
      const old = t.settings;
      if (next.chipMode !== old.chipMode || next.startingChips !== old.startingChips) {
        if (t.roundNumber > 0 || t.corrections.length > 0) {
          return fail(
            'INVALID_SETTINGS',
            "Chip mode and buy-in can't change once the game has started.",
          );
        }
        const diff = next.startingChips - old.startingChips;
        for (const p of t.players) {
          p.balance += diff;
          p.totalBuyIn += diff;
        }
      }
      t.settings = next;
      events.push({ type: 'SETTINGS_UPDATED' });
      return done();
    }

    case 'UNDO': {
      const r = t.round;
      if (!r || !t.roundInitial) return fail('NOTHING_TO_UNDO', 'There is nothing to undo.');
      if (r.phase === 'ENDED')
        return fail('UNDO_NOT_ALLOWED', "The round is over, so it can't be undone.");
      if (r.comparisonResolved || r.phase === 'AWAITING_RESULT') {
        return fail('UNDO_NOT_ALLOWED', "Cards have been compared, so this round can't be undone.");
      }
      let idx = -1;
      for (let i = r.actions.length - 1; i >= 0; i--) {
        if (UNDOABLE.has(r.actions[i]!.type)) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return fail('NOTHING_TO_UNDO', 'There is nothing to undo.');
      const undone = r.actions[idx]!;
      const remaining = r.actions.filter((_, i) => i !== idx);
      try {
        t.round = replayRound(t.roundInitial, remaining);
      } catch {
        return fail('UNDO_NOT_ALLOWED', "That action can't be undone.");
      }
      syncBalances(t);
      t.corrections.push({ type: 'UNDO', roundNumber: r.roundNumber, undone: deepClone(undone) });
      events.push({ type: 'UNDONE', action: deepClone(undone) });
      return done();
    }

    case 'SET_AWAY': {
      const tp = t.players.find((p) => p.id === action.playerId && p.present);
      if (!tp) return fail('UNKNOWN_PLAYER', "That player isn't at the table.");
      if (!!tp.away === action.away) return done();
      tp.away = action.away;
      events.push({ type: 'PLAYER_AWAY', playerId: tp.id, away: action.away });
      return done();
    }

    case 'SHOW_MY_CARDS': {
      const r = t.round;
      if (!r || r.phase !== 'ENDED' || !r.result || r.result.reason === 'cancelled') {
        return fail('ILLEGAL_ACTION', 'You can show your cards once a round is over.');
      }
      const rp = r.players.find((p) => p.id === action.playerId);
      if (!rp) return fail('UNKNOWN_PLAYER', "You didn't play this round.");
      if (r.result.revealedHands[rp.id] || r.shownHands?.[rp.id]) {
        return fail('ILLEGAL_ACTION', 'Everyone has already seen those cards.');
      }
      let cards: Card[] | null = rp.hand ? [...rp.hand] : null;
      if (!cards && r.rules.mode === 'physical') {
        const c = action.cards;
        if (!c || c.length !== 3 || !c.every(isCard) || new Set(c).size !== 3) {
          return fail('INVALID_CARDS', 'Pick the 3 cards you are showing.');
        }
        cards = [...c];
      }
      if (!cards) return fail('ILLEGAL_ACTION', 'There are no cards to show.');
      r.shownHands = { ...r.shownHands, [rp.id]: cards };
      events.push({ type: 'HAND_SHOWN', playerId: rp.id, cards: [...cards] });
      return done();
    }

    default:
      return fail('ILLEGAL_ACTION', 'Unknown action.');
  }
}
