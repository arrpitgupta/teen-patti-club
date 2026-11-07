import mongoose, { Schema, type Connection, type Model } from 'mongoose';
import type { GameSnapshot, GameStore, RoundRecord, StoredPlayer } from './types';

const LOBBY_TTL_SECONDS = 24 * 60 * 60;

const PlayerSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    avatar: { type: String, required: true },
    tokenHash: { type: String, default: null },
    isOffline: { type: Boolean, default: false },
    seat: Number,
    balance: Number,
    totalBuyIn: Number,
    joinedAt: Date,
    leftAt: { type: Date, default: null },
  },
  { _id: false },
);

const GameSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    hostPlayerId: String,
    mode: String,
    settings: Schema.Types.Mixed,
    status: { type: String, enum: ['lobby', 'active', 'ended'], index: true },
    version: Number,
    players: [PlayerSchema],
    // Engine snapshot incl. private hands. Never sent to clients as-is.
    currentRoundState: Schema.Types.Mixed,
    log: Schema.Types.Mixed,
    stats: Schema.Types.Mixed,
    paused: Boolean,
    pendingUndo: Schema.Types.Mixed,
    results: Schema.Types.Mixed,
    roundActions: Schema.Types.Mixed,
    roundStartedAt: Date,
    chat: Schema.Types.Mixed,
    chatSeq: Number,
    rematch: { type: Schema.Types.Mixed, default: null },
    createdAt: Date,
    updatedAt: Date,
    endedAt: { type: Date, default: null },
  },
  // minimize: false keeps empty objects ({}) that the engine state relies on.
  { minimize: false, versionKey: false, collection: 'games' },
);
// Lobby games with no activity for 24 h are deleted.
GameSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: LOBBY_TTL_SECONDS, partialFilterExpression: { status: 'lobby' } },
);
GameSchema.index({ 'players.tokenHash': 1 });

const RoundSchema = new Schema(
  {
    gameId: { type: String, required: true, index: true },
    roundNumber: { type: Number, required: true },
    dealerSeat: Number,
    boot: Number,
    pot: Number,
    reason: String,
    winnerIds: [String],
    winningHand: { type: String, default: null },
    revealedHands: Schema.Types.Mixed,
    actions: Schema.Types.Mixed,
    resolution: { type: String, enum: ['auto', 'tapWinner', 'enterCards', 'entered'] },
    startedAt: Date,
    endedAt: Date,
  },
  { minimize: false, versionKey: false, collection: 'rounds' },
);
RoundSchema.index({ gameId: 1, roundNumber: 1 }, { unique: true });

type Doc = Record<string, unknown>;
const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));
const toMs = (d: unknown): number | null =>
  d instanceof Date ? d.getTime() : d == null ? null : Number(d);

function toGameDoc(s: GameSnapshot): Doc {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      joinedAt: toDate(p.joinedAt),
      leftAt: toDate(p.leftAt),
    })),
    roundStartedAt: toDate(s.roundStartedAt),
    createdAt: toDate(s.createdAt),
    updatedAt: toDate(s.updatedAt),
    endedAt: toDate(s.endedAt),
  };
}

function fromGameDoc(d: Doc): GameSnapshot {
  const { _id: _ignored, ...rest } = d;
  const players = (rest.players as Doc[]).map((p): StoredPlayer => ({
    ...(p as unknown as StoredPlayer),
    joinedAt: toMs(p.joinedAt) ?? 0,
    leftAt: toMs(p.leftAt),
  }));
  return {
    ...(rest as unknown as GameSnapshot),
    players,
    roundStartedAt: toMs(rest.roundStartedAt),
    createdAt: toMs(rest.createdAt) ?? 0,
    updatedAt: toMs(rest.updatedAt) ?? 0,
    endedAt: toMs(rest.endedAt),
  };
}

function fromRoundDoc(d: Doc): RoundRecord {
  const { _id: _ignored, ...rest } = d;
  return {
    ...(rest as unknown as RoundRecord),
    startedAt: toMs(rest.startedAt) ?? 0,
    endedAt: toMs(rest.endedAt) ?? 0,
  };
}

export class MongoGameStore implements GameStore {
  private readonly games: Model<Doc>;
  private readonly rounds: Model<Doc>;

  private constructor(private readonly conn: Connection) {
    this.games = conn.model<Doc>('Game', GameSchema);
    this.rounds = conn.model<Doc>('Round', RoundSchema);
  }

  /** `dbName` overrides the database in the URI (used by tests). */
  static async connect(uri: string, dbName?: string): Promise<MongoGameStore> {
    const conn = mongoose.createConnection(uri, {
      ...(dbName ? { dbName } : {}),
      serverSelectionTimeoutMS: 15_000,
    });
    await conn.asPromise();
    const store = new MongoGameStore(conn);
    await Promise.all([store.games.createIndexes(), store.rounds.createIndexes()]);
    return store;
  }

  async saveGame(snapshot: GameSnapshot): Promise<void> {
    await this.games.replaceOne({ code: snapshot.code }, toGameDoc(snapshot), { upsert: true });
  }

  async loadOpenGames(): Promise<GameSnapshot[]> {
    const docs = await this.games.find({ status: { $in: ['lobby', 'active'] } }).lean<Doc[]>();
    return docs.map(fromGameDoc);
  }

  async findGame(code: string): Promise<GameSnapshot | null> {
    const doc = await this.games.findOne({ code }).lean<Doc>();
    return doc ? fromGameDoc(doc) : null;
  }

  async codeExists(code: string): Promise<boolean> {
    return (await this.games.exists({ code })) !== null;
  }

  async saveRound(round: RoundRecord): Promise<void> {
    await this.rounds.updateOne(
      { gameId: round.gameId, roundNumber: round.roundNumber },
      {
        $set: { ...round, startedAt: new Date(round.startedAt), endedAt: new Date(round.endedAt) },
      },
      { upsert: true },
    );
  }

  async listRounds(code: string): Promise<RoundRecord[]> {
    const docs = await this.rounds.find({ gameId: code }).sort({ roundNumber: 1 }).lean<Doc[]>();
    return docs.map(fromRoundDoc);
  }

  async findGamesByTokenHashes(hashes: string[], limit: number): Promise<GameSnapshot[]> {
    if (hashes.length === 0) return [];
    const docs = await this.games
      .find({ 'players.tokenHash': { $in: hashes } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<Doc[]>();
    return docs.map(fromGameDoc);
  }

  async close(): Promise<void> {
    await this.conn.close();
  }
}
