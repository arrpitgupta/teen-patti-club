import {
  applyAction,
  CHAT_HISTORY_LIMIT,
  computeNets,
  createDeck,
  createTable,
  describeHandValue,
  evaluateHand,
  isRoundInProgress,
  NUDGE_AFTER_MS,
  NUDGE_COOLDOWN_MS,
  rankByNet,
  settle,
  shuffle,
  type Card,
  type ChatKind,
  type ChatMessage,
  type ClientEventName,
  type ClientEventPayload,
  type GameLogEvent,
  type JoinResult,
  type LogEntry,
  type PlayerStats,
  type ReconnectResult,
  type RoundRules,
  type ServerLogEvent,
  type Settings,
  type TableAction,
} from '@tpc/shared';
import type { PushSender } from '../push';
import type { GameSnapshot, GameStore } from '../store/types';
import {
  hashToken,
  newGameCode,
  newPlayerId,
  newPlayerToken,
  newSecretId,
  secureRandomInt,
  tokenMatches,
} from '../util/crypto';
import { log } from '../util/log';
import { GroupService } from './groups';
import { privateState, publicState } from './views';
import {
  fail,
  ok,
  type Result,
  type ServerGame,
  type ServerPlayer,
  type TimerState,
} from './types';

export interface ManagerOptions {
  /** Digital mode: how long a disconnected player keeps their turn before auto-pack. */
  graceMs: number;
  /** How long the host may be away before the host role is offered to someone else. */
  hostAwayMs: number;
  /** Turn timer length for a setting in seconds (tests shorten it). */
  turnMs: (seconds: number) => number;
  persistDebounceMs: number;
  /** Ended games stay in memory this long so clients can still see results. */
  endedGameTtlMs: number;
  nudgeAfterMs: number;
  nudgeCooldownMs: number;
  /** Web push sender; null = notifications off. */
  push: PushSender | null;
  /** Restoring after a start: give up loading the open games after this long… */
  restoreLoadTimeoutMs: number;
  /** …and skip (and mark) any single game that takes longer than this to restore. */
  restoreGameBudgetMs: number;
  randomInt: (maxExclusive: number) => number;
  now: () => number;
}

export const DEFAULT_MANAGER_OPTIONS: ManagerOptions = {
  graceMs: 60_000,
  hostAwayMs: 120_000,
  turnMs: (s) => s * 1000,
  persistDebounceMs: 300,
  endedGameTtlMs: 30 * 60_000,
  nudgeAfterMs: NUDGE_AFTER_MS,
  nudgeCooldownMs: NUDGE_COOLDOWN_MS,
  push: null,
  restoreLoadTimeoutMs: 30_000,
  restoreGameBudgetMs: 1_000,
  randomInt: secureRandomInt,
  now: Date.now,
};

const LOG_LIMIT = 1000;
const ROUND_LOGGED: ReadonlySet<string> = new Set([
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
  'ADJUST',
  'UNDO',
  'CANCEL_ROUND',
]);

type ChangeListener = (game: ServerGame, entries: LogEntry[]) => void;
type KickListener = (code: string, playerId: string) => void;
type ChatListener = (game: ServerGame, message: ChatMessage) => void;

/** Preset lines are short; longer text must go as a normal message. */
const QUICK_MAX_CHARS = 40;

export interface PlayerInput {
  name: string;
  avatar: string;
  /** Group games: play as this existing member. */
  memberId?: string | undefined;
}

const needsAttention = () =>
  fail<never>('GAME_NOT_FOUND', "This game couldn't be loaded. Please start a new game.");

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Cheap sanity checks on a restored game; throws with a readable reason. */
function checkRestored(game: ServerGame): void {
  if (!/^[A-Z0-9]{6}$/.test(game.code)) throw new Error('bad game code');
  if (!game.table || !Array.isArray(game.table.players)) throw new Error('missing table state');
  if (!Array.isArray(game.players) || game.players.length === 0) throw new Error('no players');
  const ids = new Set(game.players.map((p) => p.id));
  for (const tp of game.table.players) {
    if (!ids.has(tp.id)) throw new Error(`table seat ${tp.id} has no player`);
    if (!Number.isFinite(tp.balance)) throw new Error(`balance of ${tp.id} is not a number`);
  }
  if (!ids.has(game.hostPlayerId)) throw new Error('host is not a player');
  const r = game.table.round;
  if (game.status === 'active' && r) {
    if (!Array.isArray(r.players)) throw new Error('round has no players');
    if (r.phase === 'BETTING' && !r.players.some((p) => p.id === r.turnId)) {
      throw new Error('the turn belongs to nobody in the round');
    }
  }
}

const emptyStats = (): PlayerStats => ({
  roundsPlayed: 0,
  roundsWon: 0,
  biggestPotWon: 0,
  bestHand: null,
});

export class GameManager {
  readonly opts: ManagerOptions;
  readonly groups: GroupService;
  onChange: ChangeListener = () => {};
  onKick: KickListener = () => {};
  onChat: ChatListener = () => {};

  private readonly games = new Map<string, ServerGame>();
  private readonly turnTimers = new Map<string, NodeJS.Timeout>();
  private readonly hostTimers = new Map<string, NodeJS.Timeout>();
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();
  private readonly evictTimers = new Map<string, NodeJS.Timeout>();
  private readonly saveChains = new Map<string, Promise<void>>();
  /** Round records are written in order (a shown hand is added to an already saved round). */
  private readonly roundChains = new Map<string, Promise<void>>();
  private readonly rematchLocks = new Map<string, Promise<void>>();
  private stopped = false;

  constructor(
    private readonly store: GameStore,
    opts: Partial<ManagerOptions> = {},
  ) {
    this.opts = { ...DEFAULT_MANAGER_OPTIONS, ...opts };
    this.groups = new GroupService(store, () => this.opts.now());
  }

  private now(): number {
    return this.opts.now();
  }

  getGame(code: string): ServerGame | undefined {
    return this.games.get(code);
  }

  get gameCount(): number {
    return this.games.size;
  }

  // ---------- Lifecycle ----------

  /** True while games are being loaded after a start; /health still answers meanwhile. */
  restoring = false;
  /** Games skipped on restore because they failed to load (reason per code). */
  readonly skipped = new Map<string, string>();
  private restored: Promise<void> = Promise.resolve();

  /** Resolves when restoring has finished (game requests wait for it). */
  get ready(): Promise<void> {
    return this.restored;
  }

  /**
   * Load every lobby/active game from the store (after a restart or redeploy). One bad game
   * never stops the server: a game that throws, or takes longer than `restoreGameBudgetMs`, is
   * logged, marked `needsAttention` in the store and skipped. Yields between games so HTTP
   * requests (e.g. Render's health check) are answered while restoring.
   */
  restore(): Promise<number> {
    this.restoring = true;
    const run = this.restoreAll().finally(() => {
      this.restoring = false;
    });
    this.restored = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async restoreAll(): Promise<number> {
    let snapshots: GameSnapshot[];
    try {
      snapshots = await withTimeout(
        this.store.loadOpenGames(),
        this.opts.restoreLoadTimeoutMs,
        'loading open games',
      );
    } catch (e) {
      // Phones still reconnect: each game is then loaded on demand (with the same guard).
      log.error('restore: could not load open games; they load when players reconnect', e);
      return 0;
    }
    let count = 0;
    for (const s of snapshots) {
      if (await this.restoreOne(s)) count += 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (count > 0) log.info(`restored ${count} game(s)`);
    if (this.skipped.size > 0) log.warn(`skipped ${this.skipped.size} game(s) that need attention`);
    return count;
  }

  /** Hydrates one snapshot and starts its timers; false (and marked) if it is broken or slow. */
  private async restoreOne(s: GameSnapshot): Promise<boolean> {
    const code = typeof s?.code === 'string' ? s.code : '?';
    const started = Date.now();
    let game: ServerGame;
    try {
      game = this.hydrate(s);
      checkRestored(game);
      await withTimeout(this.attachGroup(game), this.opts.restoreGameBudgetMs, 'loading group');
      this.refreshTurn(game, false);
      this.refreshTimer(game);
      this.refreshHostAway(game);
      // Build every view once: a state the views can't handle fails here, not on a request.
      publicState(game, this.now());
      for (const p of game.players) privateState(game, p.id);
    } catch (e) {
      this.clearGameTimers(code);
      await this.markNeedsAttention(code, e instanceof Error ? e.message : String(e));
      return false;
    }
    const took = Date.now() - started;
    if (took > this.opts.restoreGameBudgetMs) {
      this.clearGameTimers(code);
      await this.markNeedsAttention(code, `restoring took ${took} ms`);
      return false;
    }
    this.games.set(game.code, game);
    if (!s.resultsId) this.persistNow(game);
    return true;
  }

  private clearGameTimers(code: string): void {
    for (const m of [this.turnTimers, this.hostTimers]) {
      clearTimeout(m.get(code));
      m.delete(code);
    }
  }

  private async markNeedsAttention(code: string, reason: string): Promise<void> {
    log.error(`restore: skipped game ${code} (needs attention): ${reason}`);
    this.skipped.set(code, reason);
    await this.store
      .markNeedsAttention(code, reason, this.now())
      .catch((e: unknown) => log.error(`restore: could not mark game ${code}`, e));
  }

  /** Write all pending snapshots now. */
  async flushAll(): Promise<void> {
    const codes = [...this.persistTimers.keys()];
    for (const code of codes) {
      clearTimeout(this.persistTimers.get(code));
      this.persistTimers.delete(code);
      const game = this.games.get(code);
      if (game) this.persistNow(game);
    }
    await Promise.all([...this.saveChains.values(), ...this.roundChains.values()]);
    await this.groups.flush();
  }

  /** Stop all timers. Pending writes that were not flushed are dropped (like a crash). */
  stop(): void {
    this.stopped = true;
    for (const m of [this.turnTimers, this.hostTimers, this.persistTimers, this.evictTimers]) {
      for (const t of m.values()) clearTimeout(t);
      m.clear();
    }
  }

  // ---------- Create / join / reconnect ----------

  async createGame(
    input: PlayerInput & { settings: Settings; groupId?: string | undefined },
  ): Promise<Result<JoinResult>> {
    const group = input.groupId ? await this.groups.load(input.groupId) : null;
    if (input.groupId && !group) return fail('GROUP_NOT_FOUND', "That group doesn't exist.");
    let code = newGameCode();
    for (let i = 0; this.games.has(code) || (await this.store.codeExists(code)); i++) {
      if (i > 20) return fail('INTERNAL', 'Could not create a game code. Please try again.');
      code = newGameCode();
    }
    const now = this.now();
    const playerId = newPlayerId();
    const token = newPlayerToken();
    const game: ServerGame = {
      code,
      hostPlayerId: playerId,
      status: 'lobby',
      version: 0,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
      players: [],
      table: createTable(input.settings),
      log: [],
      stats: {},
      paused: false,
      pendingUndo: null,
      hostTransferOffer: null,
      results: null,
      roundActions: [],
      roundStartedAt: null,
      timer: null,
      chat: [],
      chatSeq: 0,
      rematch: null,
      resultsId: newSecretId(),
      group: group ? { id: group.id, name: group.name } : null,
      turn: null,
      lastNudgeAt: null,
    };
    this.games.set(code, game);
    const added = this.addPlayer(game, input, hashToken(token), false, playerId);
    if (!added.ok) {
      this.games.delete(code);
      return added;
    }
    this.commit(game, [{ type: 'GAME_CREATED', playerId }], 'now');
    return ok({ code, playerId, playerToken: token });
  }

  async joinGame(code: string, input: PlayerInput): Promise<Result<JoinResult>> {
    const game = this.games.get(code);
    if (!game) return this.missingGame(code);
    if (game.status === 'ended') return fail('GAME_ENDED', 'This game has ended.');
    if (game.group) await this.groups.load(game.group.id);
    const token = newPlayerToken();
    const added = this.addPlayer(game, input, hashToken(token), false);
    if (!added.ok) return added;
    this.commit(game, [], 'now');
    return ok({ code, playerId: added.data, playerToken: token });
  }

  async reconnect(code: string, playerToken: string): Promise<Result<ReconnectResult>> {
    await this.ready;
    let game = this.games.get(code);
    if (!game) {
      // Ended games are not kept in memory forever; load one so its results can be shown.
      const snap = await this.store.findGame(code);
      if (!snap) return fail('GAME_NOT_FOUND', "That game doesn't exist.");
      if (snap.needsAttention) return needsAttention();
      if (!this.games.has(code) && !(await this.restoreOne(snap))) return needsAttention();
      game = this.games.get(code)!;
      if (game.status === 'ended') this.scheduleEviction(game);
    }
    const player = game.players.find((p) => p.tokenHash && tokenMatches(playerToken, p.tokenHash));
    if (!player) return fail('BAD_TOKEN', "We couldn't find your seat in this game.");

    if (player.leftAt !== null && game.status !== 'ended') {
      // A player who left comes back to the table with their old balance.
      const res = applyAction(game.table, { type: 'ADD_PLAYER', playerId: player.id });
      if (!res.ok) return fail(res.error.code, res.error.message);
      game.table = res.state;
      player.leftAt = null;
      this.commit(game, res.events, 'now');
    }
    return ok({ code, playerId: player.id });
  }

  /**
   * After a game ended: the first player to ask creates the rematch (same settings, offline
   * seats carried over) and becomes its host; everyone else joins it with the same name and
   * avatar. Asking again (e.g. from another phone) issues a fresh token for the same seat.
   */
  rematch(code: string, playerId: string): Promise<Result<JoinResult>> {
    // One at a time per game, so two quick taps can't create two rematches.
    const prev = this.rematchLocks.get(code) ?? Promise.resolve();
    const run = prev.then(() => this.rematchNow(code, playerId));
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.rematchLocks.set(code, settled);
    void settled.then(() => {
      if (this.rematchLocks.get(code) === settled) this.rematchLocks.delete(code);
    });
    return run;
  }

  private async rematchNow(code: string, playerId: string): Promise<Result<JoinResult>> {
    const game = this.games.get(code);
    if (!game) return fail('GAME_NOT_FOUND', "That game doesn't exist.");
    if (game.status !== 'ended') return fail('ILLEGAL_ACTION', 'The game is still going.');
    const me = game.players.find((p) => p.id === playerId);
    if (!me || me.isOffline || me.tokenHash === null) {
      return fail('NOT_IN_GAME', "You weren't at this table.");
    }

    if (game.rematch) {
      const next = this.games.get(game.rematch.code);
      if (!next || next.status === 'ended') {
        return fail('GAME_ENDED', 'The rematch has already finished.');
      }
      const existingId = game.rematch.seats[me.id];
      const existing = next.players.find((p) => p.id === existingId && p.leftAt === null);
      if (existing) {
        const token = newPlayerToken();
        existing.tokenHash = hashToken(token);
        this.persistNow(next);
        return ok({ code: next.code, playerId: existing.id, playerToken: token });
      }
      const joined = await this.joinGame(next.code, {
        name: me.name,
        avatar: me.avatar,
        memberId: me.memberId ?? undefined,
      });
      if (!joined.ok) return joined;
      game.rematch.seats[me.id] = joined.data.playerId;
      this.persistNow(game);
      return joined;
    }

    const created = await this.createGame({
      name: me.name,
      avatar: me.avatar,
      memberId: me.memberId ?? undefined,
      groupId: game.group?.id,
      settings: structuredClone(game.table.settings),
    });
    if (!created.ok) return created;
    const next = this.games.get(created.data.code)!;
    // Players without a phone come along; the new host plays them again.
    for (const p of game.players) {
      if (!p.isOffline || p.leftAt !== null) continue;
      const added = this.addPlayer(
        next,
        { name: p.name, avatar: p.avatar, memberId: p.memberId ?? undefined },
        null,
        true,
      );
      if (added.ok) this.pushLog(next, [{ type: 'OFFLINE_SEAT_ADDED', playerId: added.data }]);
    }
    if (next.players.length > 1) this.commit(next, [], 'now');
    game.rematch = { code: next.code, seats: { [me.id]: created.data.playerId } };
    this.commit(game, [{ type: 'REMATCH_CREATED', playerId: me.id }], 'now');
    return created;
  }

  private async missingGame(code: string): Promise<Result<never>> {
    const snap = await this.store.findGame(code);
    if (snap?.status === 'ended') return fail('GAME_ENDED', 'This game has ended.');
    return fail('GAME_NOT_FOUND', "That game doesn't exist. Check the code.");
  }

  private addPlayer(
    game: ServerGame,
    input: PlayerInput,
    tokenHash: string | null,
    isOffline: boolean,
    id: string = newPlayerId(),
  ): Result<string> {
    let name = input.name;
    let memberId: string | null = null;
    const group = game.group ? this.groups.cached(game.group.id) : undefined;
    if (group) {
      const taken = new Set(
        game.players.filter((p) => p.leftAt === null && p.memberId).map((p) => p.memberId!),
      );
      const member = this.groups.resolveMember(group, input, taken);
      if (!member.ok) return member;
      ({ memberId, name } = member.data);
    }
    const res = applyAction(game.table, { type: 'ADD_PLAYER', playerId: id });
    if (!res.ok) return fail(res.error.code, res.error.message);
    game.table = res.state;
    game.players.push({
      id,
      name,
      avatar: input.avatar,
      tokenHash,
      isOffline,
      joinedAt: this.now(),
      leftAt: null,
      push: [],
      memberId,
      connected: false,
      connectedSince: null,
      disconnectedAt: null,
    });
    game.stats[id] = emptyStats();
    this.pushLog(game, res.events);
    return ok(id);
  }

  // ---------- Connections ----------

  setConnected(code: string, playerId: string, connected: boolean): void {
    const game = this.games.get(code);
    const p = game?.players.find((x) => x.id === playerId);
    if (!game || !p || p.connected === connected) return;
    const now = this.now();
    // A brand-new player connecting for the first time is not a "reconnect".
    const wasAway = p.disconnectedAt !== null;
    p.connected = connected;
    p.connectedSince = connected ? now : null;
    p.disconnectedAt = connected ? null : now;
    // After the game ended (e.g. players moving to the rematch) comings and goings are noise.
    const events: ServerLogEvent[] =
      game.status === 'ended'
        ? []
        : connected
          ? wasAway
            ? [{ type: 'PLAYER_RECONNECTED', playerId }]
            : []
          : [{ type: 'PLAYER_DISCONNECTED', playerId }];
    this.commit(game, events, 'none');
  }

  // ---------- Client events ----------

  handle(code: string, playerId: string, name: ClientEventName, payload: unknown): Result<unknown> {
    const game = this.games.get(code);
    if (!game) return fail('GAME_NOT_FOUND', "That game doesn't exist.");
    const me = game.players.find((p) => p.id === playerId);
    if (!me || me.leftAt !== null) return fail('NOT_IN_GAME', "You're not at this table.");
    if (game.status === 'ended') return fail('GAME_ENDED', 'This game has ended.');

    const isHost = game.hostPlayerId === me.id;
    const needHost = () => fail('NOT_HOST', 'Only the host can do that.');
    const gameplay = /^(action|result|round|undo):/.test(name);
    if (gameplay && game.paused) return fail('PAUSED', 'The game is paused.');
    if (gameplay && game.status !== 'active') {
      return fail('GAME_NOT_STARTED', "The game hasn't started yet.");
    }

    const p = payload as Record<string, unknown>;
    const seat = (fn: (actor: string) => TableAction): Result<unknown> => {
      const actor = this.resolveActor(game, me, p.actAs as string | undefined);
      if (!actor.ok) return actor;
      return this.apply(game, fn(actor.data));
    };

    switch (name) {
      case 'game:updateSettings': {
        if (!isHost) return needHost();
        const { settings } = payload as ClientEventPayload<'game:updateSettings'>;
        return this.apply(game, { type: 'UPDATE_SETTINGS', settings });
      }
      case 'game:start': {
        if (!isHost) return needHost();
        if (game.status !== 'lobby') return fail('ILLEGAL_ACTION', 'The game has already started.');
        game.status = 'active';
        const res = this.startRound(game, [{ type: 'GAME_STARTED' }]);
        if (!res.ok) game.status = 'lobby';
        return res;
      }
      case 'round:start':
        return isHost ? this.startRound(game) : needHost();
      case 'round:cardsDealt':
        return isHost ? this.apply(game, { type: 'CARDS_DEALT' }) : needHost();

      case 'round:showCards': {
        const { cards } = payload as ClientEventPayload<'round:showCards'>;
        return seat((id) => ({
          type: 'SHOW_MY_CARDS',
          playerId: id,
          ...(cards ? { cards: [...cards] } : {}),
        }));
      }
      case 'game:away':
        return seat((id) => ({ type: 'SET_AWAY', playerId: id, away: p.away as boolean }));

      case 'action:see':
        return seat((id) => ({ type: 'SEE', playerId: id }));
      case 'action:chaal':
        return seat((id) => ({ type: 'CHAAL', playerId: id, amount: p.amount as number }));
      case 'action:pack':
        return seat((id) => ({ type: 'PACK', playerId: id }));
      case 'action:sideshowRequest':
        return seat((id) => ({ type: 'SIDESHOW_REQUEST', playerId: id }));
      case 'action:sideshowRespond':
        return seat((id) => ({
          type: 'SIDESHOW_RESPOND',
          playerId: id,
          accept: p.accept as boolean,
        }));
      case 'action:show':
        return seat((id) => ({ type: 'SHOW', playerId: id }));
      case 'result:tapWinner':
        return seat((id) => ({
          type: 'RESULT_TAP_WINNER',
          playerId: id,
          winnerIds: p.winnerIds as string[],
        }));
      case 'action:enterHand': {
        const { cards } = payload as ClientEventPayload<'action:enterHand'>;
        return seat((id) => ({ type: 'ENTER_HAND', playerId: id, cards: [...cards] }));
      }
      case 'result:confirm':
        return seat((id) => ({ type: 'RESULT_CONFIRM', playerId: id }));
      case 'result:dispute':
        return seat((id) => ({ type: 'RESULT_DISPUTE', playerId: id }));
      case 'result:enterCards': {
        const { cards } = payload as ClientEventPayload<'result:enterCards'>;
        return seat((id) => ({ type: 'RESULT_ENTER_CARDS', playerId: id, cards: [...cards] }));
      }

      case 'undo:request': {
        if (game.pendingUndo)
          return fail('ILLEGAL_ACTION', 'An undo is already waiting for the host.');
        const dry = applyAction(game.table, { type: 'UNDO' });
        if (!dry.ok) return fail(dry.error.code, dry.error.message);
        if (isHost) return this.apply(game, { type: 'UNDO' });
        game.pendingUndo = { requestedBy: me.id, at: this.now() };
        this.commit(game, [{ type: 'UNDO_REQUESTED', playerId: me.id }], 'debounced');
        return ok(null);
      }
      case 'undo:approve': {
        if (!isHost) return needHost();
        if (!game.pendingUndo) return fail('NOTHING_TO_UNDO', 'Nobody asked for an undo.');
        game.pendingUndo = null;
        const res = this.apply(game, { type: 'UNDO' });
        if (!res.ok) this.commit(game, [], 'debounced');
        return res;
      }
      case 'undo:reject': {
        if (!isHost) return needHost();
        if (!game.pendingUndo) return fail('NOTHING_TO_UNDO', 'Nobody asked for an undo.');
        game.pendingUndo = null;
        this.commit(game, [{ type: 'UNDO_REJECTED' }], 'debounced');
        return ok(null);
      }

      case 'host:adjustChips': {
        if (!isHost) return needHost();
        const a = payload as ClientEventPayload<'host:adjustChips'>;
        return this.apply(game, {
          type: 'ADJUST',
          from: a.from,
          to: a.to,
          amount: a.amount,
          reason: a.reason,
        });
      }
      case 'host:rebuy': {
        if (!isHost) return needHost();
        return this.apply(game, { type: 'REBUY', playerId: p.playerId as string });
      }
      case 'host:kick': {
        if (!isHost) return needHost();
        const target = game.players.find((x) => x.id === p.playerId && x.leftAt === null);
        if (!target || target.id === me.id)
          return fail('ILLEGAL_ACTION', "You can't remove that player.");
        const res = this.apply(game, { type: 'REMOVE_PLAYER', playerId: target.id }, [
          { type: 'PLAYER_KICKED', playerId: target.id },
        ]);
        if (!res.ok) return res;
        target.leftAt = this.now();
        target.tokenHash = null; // their old link no longer works
        this.persistNow(game);
        this.onKick(game.code, target.id);
        return res;
      }
      case 'host:transfer': {
        if (!isHost) return needHost();
        return this.transferHost(game, p.playerId as string);
      }
      case 'host:claim': {
        if (game.hostTransferOffer?.candidateId !== me.id) {
          return fail('FORBIDDEN', 'The host role has not been offered to you.');
        }
        return this.transferHost(game, me.id);
      }
      case 'host:addOfflineSeat': {
        if (!isHost) return needHost();
        const input = payload as ClientEventPayload<'host:addOfflineSeat'>;
        const added = this.addPlayer(game, input, null, true);
        if (!added.ok) return added;
        this.commit(game, [{ type: 'OFFLINE_SEAT_ADDED', playerId: added.data }], 'now');
        return ok({ playerId: added.data });
      }
      case 'host:pause': {
        if (!isHost) return needHost();
        const paused = p.paused as boolean;
        if (game.paused === paused) return ok(null);
        game.paused = paused;
        game.timer = null; // a fresh turn timer starts on resume
        this.commit(game, [{ type: paused ? 'PAUSED' : 'RESUMED' }], 'debounced');
        return ok(null);
      }
      case 'game:leave': {
        if (isHost) return fail('ILLEGAL_ACTION', 'Make someone else the host before you leave.');
        const res = this.apply(game, { type: 'REMOVE_PLAYER', playerId: me.id });
        if (!res.ok) return res;
        me.leftAt = this.now();
        this.persistNow(game);
        return res;
      }
      case 'game:end':
        return isHost ? this.endGame(game) : needHost();

      case 'game:nudge':
        if (game.status !== 'active') return fail('GAME_NOT_STARTED', "The game hasn't started.");
        return this.nudge(game, me);

      case 'push:subscribe': {
        const { subscription } = payload as ClientEventPayload<'push:subscribe'>;
        if (me.isOffline) return fail('FORBIDDEN', 'Offline seats have no phone.');
        const sub = { endpoint: subscription.endpoint, keys: { ...subscription.keys } };
        // One entry per device; a player keeps at most 3 devices.
        me.push = [sub, ...me.push.filter((s) => s.endpoint !== sub.endpoint)].slice(0, 3);
        this.schedulePersist(game);
        return ok({ enabled: this.opts.push !== null });
      }
      case 'push:unsubscribe': {
        const { endpoint } = payload as ClientEventPayload<'push:unsubscribe'>;
        me.push = me.push.filter((s) => s.endpoint !== endpoint);
        this.schedulePersist(game);
        return ok(null);
      }

      case 'chat:send': {
        const { text, quick } = payload as ClientEventPayload<'chat:send'>;
        if (quick && text.length > QUICK_MAX_CHARS) {
          return fail('INVALID_PAYLOAD', 'Quick lines are short. Send it as a message instead.');
        }
        return this.postChat(game, me, quick ? 'quick' : 'text', text);
      }
      case 'chat:react': {
        const { emoji } = payload as ClientEventPayload<'chat:react'>;
        return this.postChat(game, me, 'reaction', emoji);
      }

      default:
        return fail('INVALID_PAYLOAD', `Unexpected event: ${name}`);
    }
  }

  /** Store a chat message with the game and hand it to the socket layer for delivery. */
  private postChat(
    game: ServerGame,
    me: ServerPlayer,
    kind: ChatKind,
    text: string,
  ): Result<ChatMessage> {
    const message: ChatMessage = {
      id: ++game.chatSeq,
      at: this.now(),
      playerId: me.id,
      kind,
      text,
    };
    game.chat.push(message);
    if (game.chat.length > CHAT_HISTORY_LIMIT) {
      game.chat.splice(0, game.chat.length - CHAT_HISTORY_LIMIT);
    }
    game.updatedAt = message.at;
    this.schedulePersist(game);
    this.onChat(game, message);
    return ok(message);
  }

  /** Banker mode: the host may act for offline seats and for disconnected players. */
  private resolveActor(
    game: ServerGame,
    me: ServerPlayer,
    actAs: string | undefined,
  ): Result<string> {
    if (!actAs || actAs === me.id) return ok(me.id);
    if (game.hostPlayerId !== me.id)
      return fail('FORBIDDEN', 'Only the host can act for another seat.');
    const target = game.players.find((x) => x.id === actAs && x.leftAt === null);
    if (!target) return fail('FORBIDDEN', "That player isn't at the table.");
    if (!target.isOffline && target.connected) {
      return fail('FORBIDDEN', 'You can only act for offline or disconnected players.');
    }
    return ok(target.id);
  }

  private startRound(game: ServerGame, extra: ServerLogEvent[] = []): Result<unknown> {
    const deck =
      game.table.settings.mode === 'digital'
        ? shuffle(createDeck(), this.opts.randomInt)
        : undefined;
    return this.apply(game, deck ? { type: 'START_ROUND', deck } : { type: 'START_ROUND' }, extra);
  }

  private transferHost(game: ServerGame, playerId: string): Result<unknown> {
    const target = game.players.find((x) => x.id === playerId && x.leftAt === null);
    if (!target || target.isOffline)
      return fail('ILLEGAL_ACTION', "That player can't be the host.");
    if (target.id === game.hostPlayerId) return ok(null);
    game.hostPlayerId = target.id;
    game.hostTransferOffer = null;
    game.pendingUndo = null;
    this.commit(game, [{ type: 'HOST_CHANGED', playerId: target.id }], 'now');
    return ok(null);
  }

  private endGame(game: ServerGame): Result<unknown> {
    if (isRoundInProgress(game.table)) {
      const res = this.apply(game, { type: 'CANCEL_ROUND' });
      if (!res.ok) return res;
    }
    const now = this.now();
    const nets = computeNets(game.table.players);
    const meta = new Map(game.players.map((p) => [p.id, p]));
    game.results = {
      endedAt: now,
      rankings: rankByNet(nets).map((n) => {
        const tp = game.table.players.find((x) => x.id === n.id)!;
        const p = meta.get(n.id)!;
        return {
          playerId: n.id,
          name: p.name,
          avatar: p.avatar,
          net: n.net,
          balance: tp.balance,
          totalBuyIn: tp.totalBuyIn,
          ...(game.stats[n.id] ?? emptyStats()),
        };
      }),
      payments: settle(nets),
      chipRate: game.table.settings.chipRate,
    };
    game.status = 'ended';
    game.endedAt = now;
    game.pendingUndo = null;
    game.hostTransferOffer = null;
    this.commit(game, [{ type: 'GAME_ENDED' }], 'now');
    this.scheduleEviction(game);
    return ok(game.results);
  }

  // ---------- Applying engine actions ----------

  private apply(
    game: ServerGame,
    action: TableAction,
    extra: ServerLogEvent[] = [],
  ): Result<unknown> {
    const res = applyAction(game.table, action);
    if (!res.ok) return fail(res.error.code, res.error.message);
    const now = this.now();
    game.table = res.state;
    if (action.type !== 'UNDO') game.pendingUndo = null; // the requested undo no longer applies

    if (action.type === 'START_ROUND') {
      game.roundStartedAt = now;
      game.roundActions = [];
    } else if (ROUND_LOGGED.has(action.type) && game.table.round) {
      game.roundActions.push({
        playerId: 'playerId' in action ? action.playerId : null,
        type: action.type,
        amount: 'amount' in action ? action.amount : null,
        stakeAfter: game.table.round.stake,
        potAfter: game.table.round.pot,
        at: now,
      });
    }

    const roundOver = res.events.some(
      (e) => e.type === 'ROUND_ENDED' || e.type === 'ROUND_CANCELLED',
    );
    if (roundOver) this.finishRound(game, now);
    for (const e of res.events) {
      if (e.type !== 'HAND_SHOWN' || !game.table.round) continue;
      const { roundNumber, rules } = game.table.round;
      const cards = [...e.cards];
      this.noteBestHand(game, e.playerId, cards, rules.a23Rank);
      this.roundWrite(
        game.code,
        () => this.store.addShownHand(game.code, roundNumber, e.playerId, cards),
        'saving shown hand failed',
      );
    }
    this.commit(game, [...extra, ...res.events], roundOver ? 'now' : 'debounced');
    return ok(null);
  }

  private noteBestHand(
    game: ServerGame,
    playerId: string,
    hand: readonly Card[],
    a23Rank: RoundRules['a23Rank'],
  ): void {
    const s = (game.stats[playerId] ??= emptyStats());
    const v = evaluateHand(hand, { a23Rank });
    if (!s.bestHand || v.score > s.bestHand.score) {
      s.bestHand = { score: v.score, name: describeHandValue(v) };
    }
  }

  private finishRound(game: ServerGame, now: number): void {
    const r = game.table.round;
    if (!r?.result) return;
    const result = r.result;
    if (result.reason !== 'cancelled') {
      for (const rp of r.players) {
        const s = (game.stats[rp.id] ??= emptyStats());
        s.roundsPlayed += 1;
        const payout = result.payouts[rp.id];
        if (payout !== undefined) {
          s.roundsWon += 1;
          s.biggestPotWon = Math.max(s.biggestPotWon, payout);
        }
        // Only hands everyone saw count (results are public; packed hands stay secret).
        const shown = result.revealedHands[rp.id];
        if (shown) this.noteBestHand(game, rp.id, shown, r.rules.a23Rank);
      }
    }
    const record = {
      gameId: game.code,
      roundNumber: r.roundNumber,
      dealerSeat: r.dealerSeat,
      boot: r.rules.boot,
      pot: result.pot,
      reason: result.reason,
      winnerIds: result.winnerIds,
      winningHand: result.winningHand,
      revealedHands: result.revealedHands,
      actions: [...game.roundActions],
      resolution: result.resolution ?? ('auto' as const),
      startedAt: game.roundStartedAt ?? now,
      endedAt: now,
    };
    this.roundWrite(game.code, () => this.store.saveRound(record), 'saving round failed');
  }

  // ---------- Commit: log, timers, persist, broadcast ----------

  private pushLog(game: ServerGame, events: GameLogEvent[]): LogEntry[] {
    const at = this.now();
    const entries = events.filter((e) => e.type !== 'TURN').map((event) => ({ at, event }));
    game.log.push(...entries);
    if (game.log.length > LOG_LIMIT) game.log.splice(0, game.log.length - LOG_LIMIT);
    return entries;
  }

  private commit(
    game: ServerGame,
    events: GameLogEvent[],
    persist: 'now' | 'debounced' | 'none',
  ): void {
    const entries = this.pushLog(game, events);
    game.version += 1;
    if (persist !== 'none') game.updatedAt = this.now();
    this.refreshTurn(game);
    this.refreshTimer(game);
    this.refreshHostAway(game);
    if (persist === 'now') this.persistNow(game);
    else if (persist === 'debounced') this.schedulePersist(game);
    this.onChange(game, entries);
  }

  // ---------- Turn timer & disconnect grace ----------

  /** Remember when the current turn started (a new turn, phase or round restarts it). */
  private refreshTurn(game: ServerGame, notify = true): void {
    const actor = this.currentActor(game);
    if (!actor) {
      game.turn = null;
      return;
    }
    const r = game.table.round!;
    // Same key as the turn timer: someone else looking at their cards doesn't restart it.
    const key = `${r.roundNumber}:${r.phase}:${actor}`;
    if (game.turn?.key === key) return;
    game.turn = { key, playerId: actor, since: this.now() };
    if (!notify) return;
    const side = r.phase === 'AWAITING_SIDESHOW_RESPONSE' ? r.pendingSideShow : null;
    const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? 'Someone';
    this.notify(
      game,
      actor,
      side
        ? {
            title: 'Side show request',
            body: `${nameOf(side.requesterId)} asks you for a side show (game ${game.code}).`,
          }
        : { title: 'Your turn', body: `Game ${game.code}: pot ${r.pot}, stake ${r.stake}.` },
    );
  }

  /**
   * "Your turn" web push to every device the player subscribed. The service worker only shows
   * it when the app isn't on screen. Never includes cards.
   */
  private notify(game: ServerGame, playerId: string, msg: { title: string; body: string }): void {
    const sender = this.opts.push;
    const p = game.players.find((x) => x.id === playerId);
    if (!sender || !p || p.isOffline || p.leftAt !== null || p.push.length === 0) return;
    const message = { ...msg, tag: `tpc-${game.code}`, url: `/g/${game.code}` };
    for (const sub of [...p.push]) {
      void sender.send(sub, message).then(({ gone }) => {
        if (!gone) return;
        p.push = p.push.filter((s) => s.endpoint !== sub.endpoint);
        this.schedulePersist(game);
      });
    }
  }

  private nudge(game: ServerGame, me: ServerPlayer): Result<unknown> {
    const now = this.now();
    const turn = game.turn;
    if (!turn) return fail('ILLEGAL_ACTION', 'Nobody is taking their turn right now.');
    if (turn.playerId === me.id) return fail('ILLEGAL_ACTION', "It's your turn!");
    const target = game.players.find((p) => p.id === turn.playerId);
    if (target?.isOffline) {
      return fail('ILLEGAL_ACTION', 'The host plays for that seat.');
    }
    if (now - turn.since < this.opts.nudgeAfterMs) {
      return fail('TOO_SOON', 'Give them a few more seconds.');
    }
    if (game.lastNudgeAt !== null && now - game.lastNudgeAt < this.opts.nudgeCooldownMs) {
      return fail('TOO_SOON', 'They were just nudged.');
    }
    game.lastNudgeAt = now;
    this.commit(game, [{ type: 'NUDGED', playerId: turn.playerId, by: me.id }], 'none');
    this.notify(game, turn.playerId, {
      title: 'Jaldi chal!',
      body: `${me.name} is waiting for you (game ${game.code}).`,
    });
    return ok(null);
  }

  /** Who the game is waiting on right now (turn player or side-show target). */
  private currentActor(game: ServerGame): string | null {
    const r = game.table.round;
    if (game.status !== 'active' || game.paused || !r) return null;
    if (r.phase === 'BETTING') return r.turnId;
    if (r.phase === 'AWAITING_SIDESHOW_RESPONSE') return r.pendingSideShow?.targetId ?? null;
    return null;
  }

  private isAway(game: ServerGame, playerId: string): boolean {
    const p = game.players.find((x) => x.id === playerId);
    if (!p) return true;
    if (p.isOffline) {
      // Offline seats are played by the host.
      return !game.players.find((x) => x.id === game.hostPlayerId)?.connected;
    }
    return !p.connected;
  }

  private setTimer(game: ServerGame, timer: TimerState | null): void {
    clearTimeout(this.turnTimers.get(game.code));
    this.turnTimers.delete(game.code);
    game.timer = timer;
    if (!timer || this.stopped) return;
    const delay = Math.max(0, timer.deadline - this.now());
    this.turnTimers.set(
      game.code,
      setTimeout(() => this.onTimerFired(game.code, timer), delay),
    );
  }

  private refreshTimer(game: ServerGame): void {
    const actor = this.currentActor(game);
    if (!actor) return this.setTimer(game, null);
    const r = game.table.round!;
    const key = `${r.roundNumber}:${r.phase}:${actor}`;
    const now = this.now();
    const existing = game.timer?.key === key ? game.timer : null;
    const turnSec = game.table.settings.turnTimerSec;
    const fullTurnMs = turnSec === null ? null : this.opts.turnMs(turnSec);

    if (this.isAway(game, actor)) {
      // Physical tables never auto-pack a disconnected player; the host can act for them.
      if (game.table.settings.mode === 'physical') return this.setTimer(game, null);
      if (existing?.kind === 'grace') return; // keep counting
      const pausedTurnMs = existing ? Math.max(0, existing.deadline - now) : fullTurnMs;
      return this.setTimer(game, {
        playerId: actor,
        kind: 'grace',
        key,
        deadline: now + this.opts.graceMs,
        durationMs: this.opts.graceMs,
        pausedTurnMs,
      });
    }

    if (existing?.kind === 'turn' || existing?.kind === 'overdue') return; // same turn
    if (existing?.kind === 'grace') {
      // Back within the grace period: resume where the turn timer stopped.
      if (existing.pausedTurnMs === null) return this.setTimer(game, null);
      return this.setTimer(game, {
        playerId: actor,
        kind: 'turn',
        key,
        deadline: now + existing.pausedTurnMs,
        durationMs: fullTurnMs ?? existing.pausedTurnMs,
        pausedTurnMs: null,
      });
    }
    if (fullTurnMs === null) return this.setTimer(game, null);
    this.setTimer(game, {
      playerId: actor,
      kind: 'turn',
      key,
      deadline: now + fullTurnMs,
      durationMs: fullTurnMs,
      pausedTurnMs: null,
    });
  }

  private onTimerFired(code: string, timer: TimerState): void {
    this.turnTimers.delete(code);
    const game = this.games.get(code);
    if (!game || game.timer !== timer) return;
    if (game.table.settings.mode === 'physical') {
      // Physical tables never auto-pack: mark the turn overdue and let the table sort it out.
      game.timer = { ...timer, kind: 'overdue', deadline: this.now() };
      this.commit(game, [{ type: 'TURN_OVERDUE', playerId: timer.playerId }], 'none');
      return;
    }
    game.timer = null;
    const res = this.apply(game, { type: 'TIMEOUT', playerId: timer.playerId });
    if (!res.ok) {
      log.warn(`timeout for ${code} was rejected: ${res.error.message}`);
      this.commit(game, [], 'none');
    }
  }

  // ---------- Host away ----------

  private refreshHostAway(game: ServerGame): void {
    clearTimeout(this.hostTimers.get(game.code));
    this.hostTimers.delete(game.code);
    if (game.status === 'ended' || this.stopped) return;
    const host = game.players.find((p) => p.id === game.hostPlayerId);
    if (!host || host.connected) {
      game.hostTransferOffer = null;
      return;
    }
    const now = this.now();
    const awayFor = now - (host.disconnectedAt ?? now);
    if (awayFor < this.opts.hostAwayMs) {
      this.hostTimers.set(
        game.code,
        setTimeout(() => {
          this.hostTimers.delete(game.code);
          if (this.games.get(game.code) === game) this.commit(game, [], 'none');
        }, this.opts.hostAwayMs - awayFor),
      );
      return;
    }
    // Offer the host role to whoever has been connected the longest.
    const candidate = game.players
      .filter((p) => p.leftAt === null && !p.isOffline && p.connected && p.id !== host.id)
      .sort((a, b) => (a.connectedSince ?? 0) - (b.connectedSince ?? 0))[0];
    if (!candidate) {
      game.hostTransferOffer = null;
    } else if (game.hostTransferOffer?.candidateId !== candidate.id) {
      game.hostTransferOffer = { candidateId: candidate.id, at: now };
      this.pushLog(game, [{ type: 'HOST_TRANSFER_OFFERED', playerId: candidate.id }]);
    }
  }

  // ---------- Persistence ----------

  private schedulePersist(game: ServerGame): void {
    if (this.persistTimers.has(game.code) || this.stopped) return;
    this.persistTimers.set(
      game.code,
      setTimeout(() => {
        this.persistTimers.delete(game.code);
        this.persistNow(game);
      }, this.opts.persistDebounceMs),
    );
  }

  private persistNow(game: ServerGame): void {
    if (this.stopped) return;
    clearTimeout(this.persistTimers.get(game.code));
    this.persistTimers.delete(game.code);
    const snapshot = this.snapshot(game);
    const prev = this.saveChains.get(game.code) ?? Promise.resolve();
    const next = prev
      .then(() => this.store.saveGame(snapshot))
      .catch((e: unknown) => log.error(`saving game ${game.code} failed`, e));
    this.saveChains.set(game.code, next);
    void next.finally(() => {
      if (this.saveChains.get(game.code) === next) this.saveChains.delete(game.code);
    });
  }

  private roundWrite(code: string, write: () => Promise<void>, what: string): void {
    const prev = this.roundChains.get(code) ?? Promise.resolve();
    const next = prev.then(write).catch((e: unknown) => log.error(what, e));
    this.roundChains.set(code, next);
    void next.finally(() => {
      if (this.roundChains.get(code) === next) this.roundChains.delete(code);
    });
  }

  private scheduleEviction(game: ServerGame): void {
    clearTimeout(this.evictTimers.get(game.code));
    if (this.stopped) return;
    this.evictTimers.set(
      game.code,
      setTimeout(() => {
        this.evictTimers.delete(game.code);
        if (this.games.get(game.code)?.status === 'ended') this.games.delete(game.code);
      }, this.opts.endedGameTtlMs),
    );
  }

  private snapshot(game: ServerGame): GameSnapshot {
    return structuredClone({
      code: game.code,
      hostPlayerId: game.hostPlayerId,
      mode: game.table.settings.mode,
      settings: game.table.settings,
      status: game.status,
      version: game.version,
      players: game.players.map((p) => {
        const tp = game.table.players.find((x) => x.id === p.id);
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          tokenHash: p.tokenHash,
          isOffline: p.isOffline,
          seat: tp?.seat ?? -1,
          balance: tp?.balance ?? 0,
          totalBuyIn: tp?.totalBuyIn ?? 0,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
          push: p.push,
          memberId: p.memberId,
        };
      }),
      currentRoundState: game.table,
      log: game.log,
      stats: game.stats,
      paused: game.paused,
      pendingUndo: game.pendingUndo,
      results: game.results,
      roundActions: game.roundActions,
      roundStartedAt: game.roundStartedAt,
      chat: game.chat,
      chatSeq: game.chatSeq,
      rematch: game.rematch,
      resultsId: game.resultsId,
      groupId: game.group?.id ?? null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      endedAt: game.endedAt,
    });
  }

  /** Loads the group of a restored game into the cache (for its name and member matching). */
  private async attachGroup(game: ServerGame): Promise<void> {
    if (!game.group) return;
    const group = await this.groups.load(game.group.id).catch((e: unknown) => {
      log.error('loading group failed', e);
      return null;
    });
    if (group) game.group.name = group.name;
  }

  /** A group was renamed: live games show the new name with their next update. */
  renameGroupInGames(groupId: string, name: string): void {
    for (const g of this.games.values()) if (g.group?.id === groupId) g.group.name = name;
  }

  /** Snapshot of a live game (fresher than the debounced one in the store). */
  liveSnapshot(code: string): GameSnapshot | null {
    const game = this.games.get(code);
    return game ? this.snapshot(game) : null;
  }

  /** Codes of live games started from this group. */
  liveGroupCodes(groupId: string): string[] {
    return [...this.games.values()].filter((g) => g.group?.id === groupId).map((g) => g.code);
  }

  private hydrate(s: GameSnapshot): ServerGame {
    const now = this.now();
    return {
      code: s.code,
      hostPlayerId: s.hostPlayerId,
      status: s.status,
      version: s.version ?? 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      endedAt: s.endedAt,
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        tokenHash: p.tokenHash,
        isOffline: p.isOffline,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
        push: Array.isArray(p.push) ? p.push : [],
        memberId: p.memberId ?? null,
        // Everyone starts disconnected after a restart; clients reconnect with their token.
        connected: false,
        connectedSince: null,
        disconnectedAt: now,
      })),
      table: s.currentRoundState,
      log: s.log ?? [],
      stats: s.stats ?? {},
      paused: s.paused ?? false,
      pendingUndo: s.pendingUndo ?? null,
      hostTransferOffer: null,
      results: s.results ?? null,
      roundActions: s.roundActions ?? [],
      roundStartedAt: s.roundStartedAt ?? null,
      timer: null,
      chat: s.chat ?? [],
      chatSeq: s.chatSeq ?? s.chat?.at(-1)?.id ?? 0,
      rematch: s.rematch ?? null,
      // Games from before results links get one now (saved with the next snapshot).
      resultsId: s.resultsId ?? newSecretId(),
      group: s.groupId ? { id: s.groupId, name: '' } : null,
      turn: null,
      lastNudgeAt: null,
    };
  }
}
