import type {
  ChatMessage,
  GroupMember,
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
  /** Group games: which group member this seat is (for the group's leaderboard). */
  memberId?: string | null;
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
  /** Long random id of the read-only results page (/r/<id>). Missing on very old games. */
  resultsId?: string;
  /** The group this game was started from. */
  groupId?: string | null;
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
  /** "Show my cards" after the round. */
  shownHands?: Record<string, string[]>;
  actions: RoundActionRecord[];
  resolution: ResolutionMethod;
  startedAt: number;
  endedAt: number;
}

export interface GroupRecord {
  id: string;
  name: string;
  settings: Settings;
  members: (GroupMember & { joinedAt: number })[];
  createdAt: number;
  updatedAt: number;
}

/** The parts of a game the group page needs. */
export type GroupGameSnapshot = Pick<
  GameSnapshot,
  'code' | 'resultsId' | 'status' | 'mode' | 'createdAt' | 'endedAt' | 'players' | 'results'
> & { currentRoundState: Pick<TableState, 'roundNumber' | 'players'> };

export interface GameStore {
  saveGame(snapshot: GameSnapshot): Promise<void>;
  /** Games that are still being played (lobby or active). */
  loadOpenGames(): Promise<GameSnapshot[]>;
  findGame(code: string): Promise<GameSnapshot | null>;
  codeExists(code: string): Promise<boolean>;
  saveRound(round: RoundRecord): Promise<void>;
  listRounds(code: string): Promise<RoundRecord[]>;
  findGamesByTokenHashes(hashes: string[], limit: number): Promise<GameSnapshot[]>;
  findGameByResultsId(resultsId: string): Promise<GameSnapshot | null>;
  /** Adds a voluntarily shown hand to an already saved round. */
  addShownHand(code: string, roundNumber: number, playerId: string, cards: string[]): Promise<void>;
  saveGroup(group: GroupRecord): Promise<void>;
  findGroup(id: string): Promise<GroupRecord | null>;
  /** Newest first. */
  listGroupGames(groupId: string, limit: number): Promise<GroupGameSnapshot[]>;
  close(): Promise<void>;
}
