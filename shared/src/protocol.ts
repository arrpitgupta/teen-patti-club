// Shapes the server sends to clients. Shared so the client is typed against the same definitions.
import type { EngineErrorCode } from './engine/types';
import type { Settings } from './games/teenPatti/settings';
import type { PlayerId, TeenPattiEvent } from './games/teenPatti/types';
import type { PrivateView, PublicTable } from './games/teenPatti/views';
import type { Payment } from './settlement/settlement';

export type ServerErrorCode =
  | EngineErrorCode
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'NOT_IN_GAME'
  | 'GAME_NOT_FOUND'
  | 'GAME_ENDED'
  | 'GAME_NOT_STARTED'
  | 'NOT_HOST'
  | 'FORBIDDEN'
  | 'PAUSED'
  | 'BAD_TOKEN'
  | 'INTERNAL';

export interface ServerError {
  code: ServerErrorCode;
  message: string;
}

/** Every client→server event may pass an ack callback; it receives this. */
export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: ServerError };

export interface JoinResult {
  code: string;
  playerId: PlayerId;
  /** Store in localStorage; send with game:reconnect. Only its hash is kept on the server. */
  playerToken: string;
}

export interface ReconnectResult {
  code: string;
  playerId: PlayerId;
}

export type GameStatus = 'lobby' | 'active' | 'ended';

/** Things the server logs in addition to engine events. */
export type ServerLogEvent =
  | { type: 'GAME_CREATED'; playerId: PlayerId }
  | { type: 'GAME_STARTED' }
  | { type: 'GAME_ENDED' }
  | { type: 'HOST_CHANGED'; playerId: PlayerId }
  | { type: 'HOST_TRANSFER_OFFERED'; playerId: PlayerId }
  | { type: 'PLAYER_KICKED'; playerId: PlayerId }
  | { type: 'OFFLINE_SEAT_ADDED'; playerId: PlayerId }
  | { type: 'PLAYER_DISCONNECTED'; playerId: PlayerId }
  | { type: 'PLAYER_RECONNECTED'; playerId: PlayerId }
  | { type: 'PAUSED' }
  | { type: 'RESUMED' }
  | { type: 'UNDO_REQUESTED'; playerId: PlayerId }
  | { type: 'UNDO_REJECTED' }
  /** Sent only to a kicked player's sockets. */
  | { type: 'YOU_WERE_KICKED' };

export type GameLogEvent = TeenPattiEvent | ServerLogEvent;

export interface LogEntry {
  at: number;
  event: GameLogEvent;
}

/** Payload of the `event` socket message (toasts / animations). */
export interface EventBatch {
  entries: LogEntry[];
}

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  avatar: string;
  /** Offline seat controlled by the host (banker mode). */
  isOffline: boolean;
  /** false → show a "reconnecting…" badge (ignored for offline seats). */
  connected: boolean;
  seat: number;
  balance: number;
  totalBuyIn: number;
  /** false once the player has left. */
  present: boolean;
}

export interface PlayerStats {
  roundsPlayed: number;
  roundsWon: number;
  biggestPotWon: number;
  /** Digital mode: best hand dealt to this player. */
  bestHand: { score: number; name: string } | null;
}

export interface RankingRow extends PlayerStats {
  playerId: PlayerId;
  name: string;
  avatar: string;
  net: number;
  balance: number;
  totalBuyIn: number;
}

export interface GameResults {
  endedAt: number;
  /** Sorted by net, highest first. */
  rankings: RankingRow[];
  payments: Payment[];
  chipRate: number | null;
}

export interface TimerInfo {
  playerId: PlayerId;
  /** turn: normal turn timer. grace: player disconnected on their turn (digital). */
  kind: 'turn' | 'grace';
  /** Server epoch ms. Compare with `serverNow` to correct for clock skew. */
  deadline: number;
  durationMs: number;
}

export interface PublicGameState {
  code: string;
  status: GameStatus;
  /** Increases with every change; lets clients drop stale updates. */
  version: number;
  hostPlayerId: PlayerId;
  paused: boolean;
  createdAt: number;
  serverNow: number;
  players: PublicPlayer[];
  table: PublicTable;
  timer: TimerInfo | null;
  pendingUndo: { requestedBy: PlayerId; at: number } | null;
  /** The host has been away > 2 min: this player may take over with `host:claim`. */
  hostTransferOffer: { candidateId: PlayerId; at: number } | null;
  stats: Record<PlayerId, PlayerStats>;
  results: GameResults | null;
  /** Most recent log entries (full log via REST later). */
  log: LogEntry[];
}

export interface PrivateGameState extends PrivateView {
  isHost: boolean;
}

export interface GameSummary {
  code: string;
  status: GameStatus;
  mode: Settings['mode'];
  createdAt: number;
  endedAt: number | null;
  roundNumber: number;
  players: { id: PlayerId; name: string; avatar: string; balance: number; net: number }[];
  results: GameResults | null;
}
