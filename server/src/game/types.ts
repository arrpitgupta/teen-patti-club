import type {
  ChatMessage,
  GameResults,
  GameStatus,
  LogEntry,
  PlayerStats,
  ServerError,
  TableState,
} from '@tpc/shared';
import type { PushSubscriptionData } from '../push';
import type { RoundActionRecord } from '../store/types';

export interface ServerPlayer {
  id: string;
  name: string;
  avatar: string;
  tokenHash: string | null;
  isOffline: boolean;
  joinedAt: number;
  leftAt: number | null;
  /** Web push subscriptions ("your turn"), one per device. Never sent to clients. */
  push: PushSubscriptionData[];
  // Runtime only (not persisted):
  connected: boolean;
  connectedSince: number | null;
  disconnectedAt: number | null;
}

export interface TimerState {
  playerId: string;
  /** overdue: physical-mode turn timer ran out; nothing happens automatically. */
  kind: 'turn' | 'grace' | 'overdue';
  /** Identifies one "turn" so the timer isn't reset by unrelated changes (e.g. someone seeing). */
  key: string;
  deadline: number;
  durationMs: number;
  /** Turn time left when the grace period started (to resume on reconnect). null = no turn timer. */
  pausedTurnMs: number | null;
}

export interface ServerGame {
  code: string;
  hostPlayerId: string;
  status: GameStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  /** In join order. Seats/balances live in `table`. */
  players: ServerPlayer[];
  table: TableState;
  log: LogEntry[];
  stats: Record<string, PlayerStats>;
  paused: boolean;
  pendingUndo: { requestedBy: string; at: number } | null;
  hostTransferOffer: { candidateId: string; at: number } | null;
  results: GameResults | null;
  roundActions: RoundActionRecord[];
  roundStartedAt: number | null;
  timer: TimerState | null;
  /** Last CHAT_HISTORY_LIMIT messages, saved with the game. */
  chat: ChatMessage[];
  /** Id of the last chat message (ids keep increasing even when old ones are dropped). */
  chatSeq: number;
  /** Ended games: the rematch game and which old player became which new player. */
  rematch: RematchInfo | null;
  // Runtime only: whose turn it is and since when (for nudges); last nudge.
  turn: { key: string; playerId: string; since: number } | null;
  lastNudgeAt: number | null;
}

export interface RematchInfo {
  code: string;
  seats: Record<string, string>;
}

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: ServerError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = <T = never>(code: ServerError['code'], message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});
