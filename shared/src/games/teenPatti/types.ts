import type { Card } from '../../cards/cards';
import type { ActionResult } from '../../engine/types';
import type { Settings } from './settings';

export type PlayerId = string;
/** A chip adjustment moves chips between two players, or (during a round) a player and the pot. */
export type AdjustTarget = PlayerId | 'pot';

/** Settings that a round runs with (snapshotted at round start). */
export type RoundRules = Pick<
  Settings,
  | 'mode'
  | 'chipMode'
  | 'boot'
  | 'maxChaal'
  | 'potLimit'
  | 'maxBlinds'
  | 'a23Rank'
  | 'blindCanShow'
  | 'physicalResolution'
>;

export interface RoundPlayer {
  id: PlayerId;
  seat: number;
  /** Live balance (already includes chips paid this round). */
  balance: number;
  /** Chips put into this round's pot. */
  contributed: number;
  seen: boolean;
  packed: boolean;
  /** Blind bets made this round (for the max-blinds rule). */
  blindBets: number;
  /** Digital mode only. Server-side secret; never sent to other players. */
  hand: Card[] | null;
}

export type RoundPhase =
  | 'DEALING' // physical: waiting for "Cards dealt"
  | 'BETTING'
  | 'AWAITING_SIDESHOW_RESPONSE'
  | 'AWAITING_RESULT' // cards are being compared
  | 'ENDED';

export type ComparisonReason = 'sideshow' | 'show' | 'potLimit';
export type ResolutionMethod = 'auto' | 'tapWinner' | 'enterCards';

export interface ResultProposal {
  by: PlayerId;
  /** One winner, or several for a tie. */
  winnerIds: PlayerId[];
  confirmedBy: PlayerId[];
}

export interface Comparison {
  reason: ComparisonReason;
  /** Who asked (side show / show). null for the automatic pot-limit show. */
  requesterId: PlayerId | null;
  /** Involved players. For side show and show, the requester is first. */
  playerIds: PlayerId[];
  method: ResolutionMethod;
  proposal: ResultProposal | null;
  enteredCards: Record<PlayerId, Card[]>;
}

/** Cards shown privately between two side-show players. */
export interface SideShowReveal {
  viewerIds: PlayerId[];
  hands: Record<PlayerId, Card[]>;
}

export interface RoundResult {
  reason: 'allPacked' | 'show' | 'potLimit' | 'cancelled';
  winnerIds: PlayerId[];
  pot: number;
  payouts: Record<PlayerId, number>;
  /** Hands revealed to everyone (show / pot-limit show). Empty if nothing was revealed. */
  revealedHands: Record<PlayerId, Card[]>;
  resolution: ResolutionMethod | null;
  /** e.g. "Pair of Kings", when the winning hand is known. */
  winningHand: string | null;
  /** The "because …" clause for the recap, when hands are known. */
  explanation: string | null;
}

export interface RoundState {
  roundNumber: number;
  dealerSeat: number;
  rules: RoundRules;
  /** Clockwise (ascending seat). */
  players: RoundPlayer[];
  pot: number;
  /** Current stake, in blind terms. */
  stake: number;
  turnId: PlayerId | null;
  phase: RoundPhase;
  pendingSideShow: { requesterId: PlayerId; targetId: PlayerId } | null;
  comparison: Comparison | null;
  sideShowReveals: SideShowReveal[];
  /** True once any cards were compared; undo is blocked after that. */
  comparisonResolved: boolean;
  /** Every action applied this round, in order (for replay / undo). */
  actions: RoundAction[];
  result: RoundResult | null;
  /** Balances before the boot, to restore if the round is cancelled. */
  startBalances: Record<PlayerId, number>;
}

export type RoundAction =
  | { type: 'CARDS_DEALT' }
  | { type: 'SEE'; playerId: PlayerId }
  | { type: 'CHAAL'; playerId: PlayerId; amount: number }
  | { type: 'PACK'; playerId: PlayerId }
  /** Turn timer ran out: packs on a turn, denies a pending side show. */
  | { type: 'TIMEOUT'; playerId: PlayerId }
  | { type: 'SIDESHOW_REQUEST'; playerId: PlayerId }
  | { type: 'SIDESHOW_RESPOND'; playerId: PlayerId; accept: boolean }
  | { type: 'SHOW'; playerId: PlayerId }
  | { type: 'RESULT_TAP_WINNER'; playerId: PlayerId; winnerIds: PlayerId[] }
  | { type: 'RESULT_CONFIRM'; playerId: PlayerId }
  | { type: 'RESULT_DISPUTE'; playerId: PlayerId }
  | { type: 'RESULT_ENTER_CARDS'; playerId: PlayerId; cards: Card[] }
  | { type: 'ADJUST'; from: AdjustTarget; to: AdjustTarget; amount: number; reason: string };

export type TableOnlyAction =
  | { type: 'ADD_PLAYER'; playerId: PlayerId; seat?: number }
  | { type: 'REMOVE_PLAYER'; playerId: PlayerId }
  /** Digital mode: `deck` is a full 52-card deck already shuffled by the server. */
  | { type: 'START_ROUND'; deck?: Card[] }
  | { type: 'CANCEL_ROUND' }
  | { type: 'REBUY'; playerId: PlayerId }
  | { type: 'UPDATE_SETTINGS'; settings: Settings }
  | { type: 'UNDO' };

export type TableAction = RoundAction | TableOnlyAction;

export interface TablePlayer {
  id: PlayerId;
  seat: number;
  balance: number;
  /** Starting chips plus all re-buys. Net for settlement = balance - totalBuyIn. */
  totalBuyIn: number;
  /** False once the player has left; their balance is kept for settlement. */
  present: boolean;
}

export type Correction =
  | { type: 'UNDO'; roundNumber: number; undone: RoundAction }
  | {
      type: 'ADJUST';
      roundNumber: number | null;
      from: AdjustTarget;
      to: AdjustTarget;
      amount: number;
      reason: string;
    }
  | { type: 'REBUY'; playerId: PlayerId; amount: number };

export interface TableState {
  settings: Settings;
  /** In join order. */
  players: TablePlayer[];
  dealerSeat: number | null;
  roundNumber: number;
  /** Current round, or the last finished one (phase ENDED) between rounds. */
  round: RoundState | null;
  /** Snapshot of the round right after it started; undo replays from here. */
  roundInitial: RoundState | null;
  corrections: Correction[];
}

export type TeenPattiEvent =
  | { type: 'PLAYER_JOINED'; playerId: PlayerId; seat: number }
  | { type: 'PLAYER_LEFT'; playerId: PlayerId }
  | {
      type: 'ROUND_STARTED';
      roundNumber: number;
      dealerSeat: number;
      playerIds: PlayerId[];
      boot: number;
      pot: number;
    }
  | { type: 'CARDS_DEALT' }
  | { type: 'TURN'; playerId: PlayerId }
  | { type: 'SAW_CARDS'; playerId: PlayerId }
  | { type: 'BET'; playerId: PlayerId; amount: number; blind: boolean; stake: number; pot: number }
  | { type: 'PACKED'; playerId: PlayerId; timedOut: boolean }
  | {
      type: 'SIDESHOW_REQUESTED';
      playerId: PlayerId;
      targetId: PlayerId;
      amount: number;
      pot: number;
    }
  | { type: 'SIDESHOW_DENIED'; playerId: PlayerId; requesterId: PlayerId; timedOut: boolean }
  | { type: 'SIDESHOW_ACCEPTED'; playerId: PlayerId; requesterId: PlayerId }
  | {
      type: 'SIDESHOW_RESULT';
      winnerId: PlayerId;
      loserId: PlayerId;
      tie: boolean;
      resolution: ResolutionMethod;
    }
  | {
      type: 'SHOW_REQUESTED';
      playerId: PlayerId;
      opponentId: PlayerId;
      amount: number;
      pot: number;
    }
  | { type: 'POT_LIMIT_REACHED'; pot: number; playerIds: PlayerId[] }
  | {
      type: 'COMPARISON_STARTED';
      reason: ComparisonReason;
      playerIds: PlayerId[];
      method: ResolutionMethod;
    }
  | { type: 'RESULT_PROPOSED'; playerId: PlayerId; winnerIds: PlayerId[] }
  | { type: 'RESULT_CONFIRMED'; playerId: PlayerId }
  | { type: 'RESULT_DISPUTED'; playerId: PlayerId }
  | { type: 'RESULT_CARDS_ENTERED'; playerId: PlayerId }
  | { type: 'ROUND_ENDED'; result: RoundResult }
  | { type: 'ROUND_CANCELLED'; roundNumber: number }
  | { type: 'CHIPS_ADJUSTED'; from: AdjustTarget; to: AdjustTarget; amount: number; reason: string }
  | { type: 'REBUY'; playerId: PlayerId; amount: number }
  | { type: 'UNDONE'; action: RoundAction }
  | { type: 'SETTINGS_UPDATED' };

export type TeenPattiResult<S> = ActionResult<S, TeenPattiEvent>;
