import {
  applyAction,
  computeNets,
  createDeck,
  createTable,
  describeHandValue,
  evaluateHand,
  isRoundInProgress,
  rankByNet,
  settle,
  shuffle,
  type ClientEventName,
  type ClientEventPayload,
  type GameLogEvent,
  type JoinResult,
  type LogEntry,
  type PlayerStats,
  type ReconnectResult,
  type ServerLogEvent,
  type Settings,
  type TableAction,
} from '@tpc/shared';
import type { GameSnapshot, GameStore } from '../store/types';
import {
  hashToken,
  newGameCode,
  newPlayerId,
  newPlayerToken,
  secureRandomInt,
  tokenMatches,
} from '../util/crypto';
import { log } from '../util/log';
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
  randomInt: (maxExclusive: number) => number;
  now: () => number;
}

export const DEFAULT_MANAGER_OPTIONS: ManagerOptions = {
  graceMs: 60_000,
  hostAwayMs: 120_000,
  turnMs: (s) => s * 1000,
  persistDebounceMs: 300,
  endedGameTtlMs: 30 * 60_000,
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
  'ADJUST',
  'UNDO',
  'CANCEL_ROUND',
]);

type ChangeListener = (game: ServerGame, entries: LogEntry[]) => void;
type KickListener = (code: string, playerId: string) => void;

export interface PlayerInput {
  name: string;
  avatar: string;
}

const emptyStats = (): PlayerStats => ({
  roundsPlayed: 0,
  roundsWon: 0,
  biggestPotWon: 0,
  bestHand: null,
});

export class GameManager {
  readonly opts: ManagerOptions;
  onChange: ChangeListener = () => {};
  onKick: KickListener = () => {};

  private readonly games = new Map<string, ServerGame>();
  private readonly turnTimers = new Map<string, NodeJS.Timeout>();
  private readonly hostTimers = new Map<string, NodeJS.Timeout>();
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();
  private readonly evictTimers = new Map<string, NodeJS.Timeout>();
  private readonly saveChains = new Map<string, Promise<void>>();
  private stopped = false;

  constructor(
    private readonly store: GameStore,
    opts: Partial<ManagerOptions> = {},
  ) {
    this.opts = { ...DEFAULT_MANAGER_OPTIONS, ...opts };
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

  /** Load every lobby/active game from the store (after a restart or redeploy). */
  async restore(): Promise<number> {
    const snapshots = await this.store.loadOpenGames();
    for (const s of snapshots) {
      const game = this.hydrate(s);
      this.games.set(game.code, game);
      this.refreshTimer(game);
      this.refreshHostAway(game);
    }
    if (snapshots.length > 0) log.info(`restored ${snapshots.length} game(s)`);
    return snapshots.length;
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
    await Promise.all([...this.saveChains.values()]);
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

  async createGame(input: PlayerInput & { settings: Settings }): Promise<Result<JoinResult>> {
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
    const token = newPlayerToken();
    const added = this.addPlayer(game, input, hashToken(token), false);
    if (!added.ok) return added;
    this.commit(game, [], 'now');
    return ok({ code, playerId: added.data, playerToken: token });
  }

  async reconnect(code: string, playerToken: string): Promise<Result<ReconnectResult>> {
    let game = this.games.get(code);
    if (!game) {
      // Ended games are not kept in memory forever; load one so its results can be shown.
      const snap = await this.store.findGame(code);
      if (!snap) return fail('GAME_NOT_FOUND', "That game doesn't exist.");
      game = this.games.get(code) ?? this.hydrate(snap);
      this.games.set(code, game);
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
    const res = applyAction(game.table, { type: 'ADD_PLAYER', playerId: id });
    if (!res.ok) return fail(res.error.code, res.error.message);
    game.table = res.state;
    game.players.push({
      id,
      name: input.name,
      avatar: input.avatar,
      tokenHash,
      isOffline,
      joinedAt: this.now(),
      leftAt: null,
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
    const events: ServerLogEvent[] = connected
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

      default:
        return fail('INVALID_PAYLOAD', `Unexpected event: ${name}`);
    }
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
    this.commit(game, [...extra, ...res.events], roundOver ? 'now' : 'debounced');
    return ok(null);
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
        if (rp.hand) {
          const v = evaluateHand(rp.hand, { a23Rank: r.rules.a23Rank });
          if (!s.bestHand || v.score > s.bestHand.score) {
            s.bestHand = { score: v.score, name: describeHandValue(v) };
          }
        }
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
    this.store.saveRound(record).catch((e: unknown) => log.error('saving round failed', e));
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
    this.refreshTimer(game);
    this.refreshHostAway(game);
    if (persist === 'now') this.persistNow(game);
    else if (persist === 'debounced') this.schedulePersist(game);
    this.onChange(game, entries);
  }

  // ---------- Turn timer & disconnect grace ----------

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
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      endedAt: game.endedAt,
    });
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
    };
  }
}
