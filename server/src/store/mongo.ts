import mongoose, { Schema, type Connection, type Model } from 'mongoose';
import type {
  GameSnapshot,
  GameStore,
  GroupGameSnapshot,
  GroupRecord,
  RoundRecord,
  StoredPlayer,
} from './types';

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
    push: { type: Schema.Types.Mixed, default: [] },
    memberId: { type: String, default: null },
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
    resultsId: String,
    groupId: { type: String, default: null },
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
GameSchema.index({ resultsId: 1 }, { unique: true, sparse: true });
GameSchema.index(
  { groupId: 1, createdAt: -1 },
  { partialFilterExpression: { groupId: { $type: 'string' } } },
);

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
    shownHands: { type: Schema.Types.Mixed, default: {} },
    actions: Schema.Types.Mixed,
    resolution: { type: String, enum: ['auto', 'tapWinner', 'enterCards', 'entered'] },
    startedAt: Date,
    endedAt: Date,
  },
  { minimize: false, versionKey: false, collection: 'rounds' },
);
RoundSchema.index({ gameId: 1, roundNumber: 1 }, { unique: true });

const GroupSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: String,
    settings: Schema.Types.Mixed,
    members: Schema.Types.Mixed,
    createdAt: Date,
    updatedAt: Date,
  },
  { minimize: false, versionKey: false, collection: 'groups' },
);

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
  private readonly groups: Model<Doc>;

  private constructor(private readonly conn: Connection) {
    this.games = conn.model<Doc>('Game', GameSchema);
    this.rounds = conn.model<Doc>('Round', RoundSchema);
    this.groups = conn.model<Doc>('Group', GroupSchema);
  }

  /** `dbName` overrides the database in the URI (used by tests). */
  static async connect(uri: string, dbName?: string): Promise<MongoGameStore> {
    const conn = mongoose.createConnection(uri, {
      ...(dbName ? { dbName } : {}),
      serverSelectionTimeoutMS: 15_000,
    });
    await conn.asPromise();
    const store = new MongoGameStore(conn);
    await Promise.all([
      store.games.createIndexes(),
      store.rounds.createIndexes(),
      store.groups.createIndexes(),
    ]);
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

  async findGameByResultsId(resultsId: string): Promise<GameSnapshot | null> {
    const doc = await this.games.findOne({ resultsId }).lean<Doc>();
    return doc ? fromGameDoc(doc) : null;
  }

  async addShownHand(
    code: string,
    roundNumber: number,
    playerId: string,
    cards: string[],
  ): Promise<void> {
    // Player ids are base64url, so they are safe as a field name.
    await this.rounds.updateOne(
      { gameId: code, roundNumber },
      { $set: { [`shownHands.${playerId}`]: cards } },
    );
  }

  async saveGroup(group: GroupRecord): Promise<void> {
    await this.groups.replaceOne(
      { id: group.id },
      { ...group, createdAt: new Date(group.createdAt), updatedAt: new Date(group.updatedAt) },
      { upsert: true },
    );
  }

  async findGroup(id: string): Promise<GroupRecord | null> {
    const doc = await this.groups.findOne({ id }).lean<Doc>();
    if (!doc) return null;
    const { _id: _ignored, ...rest } = doc;
    return {
      ...(rest as unknown as GroupRecord),
      createdAt: toMs(rest.createdAt) ?? 0,
      updatedAt: toMs(rest.updatedAt) ?? 0,
    };
  }

  async listGroupGames(groupId: string, limit: number): Promise<GroupGameSnapshot[]> {
    const docs = await this.games
      .find({ groupId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select({
        code: 1,
        resultsId: 1,
        status: 1,
        mode: 1,
        createdAt: 1,
        endedAt: 1,
        players: 1,
        results: 1,
        'currentRoundState.roundNumber': 1,
        'currentRoundState.players': 1,
      })
      .lean<Doc[]>();
    return docs.map((d) => ({
      ...(d as unknown as GroupGameSnapshot),
      createdAt: toMs(d.createdAt) ?? 0,
      endedAt: toMs(d.endedAt),
    }));
  }

  async close(): Promise<void> {
    await this.conn.close();
  }
}
