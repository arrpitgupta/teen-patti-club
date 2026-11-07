import type {
  ChatMessage,
  GameResults,
  GameStatus,
  LogEntry,
  PlayerStats,
  ResolutionMethod,
  Settings,
  TableState,
} from '@tpc/shared';

export interface StoredPlayer {
  id: string;
  name: string;
  avatar: string;
  /** SHA-256 of the player token. null for offline seats and kicked players. */
  tokenHash: string | null;
  isOffline: boolean;
  seat: number;
  balance: number;
  totalBuyIn: number;
  joinedAt: number;
  leftAt: number | null;
  push?: { endpoint: string; keys: { p256dh: string; auth: string } }[];
}

/** Everything needed to rebuild a live game after a restart. */
export interface GameSnapshot {
  code: string;
  hostPlayerId: string;
  mode: Settings['mode'];
  settings: Settings;
  status: GameStatus;
  version: number;
  players: StoredPlayer[];
  /** Full engine state, including private hands (server-side only). */
  currentRoundState: TableState;
  log: LogEntry[];
  stats: Record<string, PlayerStats>;
  paused: boolean;
  pendingUndo: { requestedBy: string; at: number } | null;
  results: GameResults | null;
  roundActions: RoundActionRecord[];
  roundStartedAt: number | null;
  chat: ChatMessage[];
  chatSeq: number;
  rematch: { code: string; seats: Record<string, string> } | null;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
}

export interface RoundActionRecord {
  playerId: string | null;
  type: string;
  amount: number | null;
  stakeAfter: number;
  potAfter: number;
  at: number;
}

export interface RoundRecord {
  gameId: string;
  roundNumber: number;
  dealerSeat: number;
  boot: number;
  pot: number;
  reason: string;
  winnerIds: string[];
  winningHand: string | null;
  revealedHands: Record<string, string[]>;
  actions: RoundActionRecord[];
  resolution: ResolutionMethod;
  startedAt: number;
  endedAt: number;
}

export interface GameStore {
  saveGame(snapshot: GameSnapshot): Promise<void>;
  /** Games that are still being played (lobby or active). */
  loadOpenGames(): Promise<GameSnapshot[]>;
  findGame(code: string): Promise<GameSnapshot | null>;
  codeExists(code: string): Promise<boolean>;
  saveRound(round: RoundRecord): Promise<void>;
  listRounds(code: string): Promise<RoundRecord[]>;
  findGamesByTokenHashes(hashes: string[], limit: number): Promise<GameSnapshot[]>;
  close(): Promise<void>;
}
