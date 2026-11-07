export type EngineErrorCode =
  | 'ILLEGAL_ACTION'
  | 'NOT_YOUR_TURN'
  | 'INVALID_AMOUNT'
  | 'MUST_SEE'
  | 'INSUFFICIENT_CHIPS'
  | 'ALREADY_SEEN'
  | 'NOT_DEALT'
  | 'ROUND_OVER'
  | 'NO_ROUND'
  | 'ROUND_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'TABLE_FULL'
  | 'UNKNOWN_PLAYER'
  | 'ALREADY_SEATED'
  | 'INVALID_DECK'
  | 'INVALID_CARDS'
  | 'INVALID_SETTINGS'
  | 'INVALID_ADJUSTMENT'
  | 'NOTHING_TO_UNDO'
  | 'UNDO_NOT_ALLOWED';

/** A rejected action. `message` is plain English, safe to show to players. */
export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export type ActionResult<S, E> =
  { ok: true; state: S; events: E[] } | { ok: false; error: EngineError };

export function engineError(code: EngineErrorCode, message: string): EngineError {
  return { code, message };
}

/**
 * A pluggable card game. Implementations are pure: same state + action → same result.
 * Randomness (e.g. a shuffled deck) is passed in through actions.
 */
export interface GameDefinition<State, Action, Event, Legal, Setup> {
  readonly id: string;
  readonly displayName: string;
  /** Create an empty table for this game. */
  setup(input: Setup): State;
  /** What a player may do right now (UI hints; the server re-validates via applyAction). */
  legalActions(state: State, playerId: string): Legal;
  /** Apply one action. Never mutates `state`. */
  applyAction(state: State, action: Action): ActionResult<State, Event>;
  /** True when no round is being played (between rounds). */
  isRoundOver(state: State): boolean;
}
