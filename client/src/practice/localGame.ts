// A whole game running on this phone with the shared engine: practice vs bots and the
// tutorial. It produces the same public/private states the server sends, so the normal table
// UI works unchanged. `send()` in lib/socket routes here while a local game is active.
import {
  applyAction,
  computeNets,
  createDeck,
  createTable,
  defaultSettings,
  describeHandValue,
  evaluateHand,
  isRoundInProgress,
  privateView,
  publicView,
  rankByNet,
  settle,
  shuffle,
  type Ack,
  type Card,
  type ChatMessage,
  type ClientEventName,
  type GameLogEvent,
  type GameResults,
  type LogEntry,
  type PlayerStats,
  type PublicGameState,
  type Settings,
  type TableAction,
  type TableState,
} from '@tpc/shared';
import { t } from '../i18n';
import { useChat } from '../store/chat';
import { useGame } from '../store/game';
import { botMove, type BotProfile } from './bots';

export const LOCAL_CODE = 'PRACTICE';
export const ME = 'you';

export interface LocalHooks {
  /** Veto a player action (tutorial: "follow the coach"). Return an error message to block. */
  allow?(name: ClientEventName, payload: Record<string, unknown>, table: TableState): string | null;
  /** Scripted bot action; return undefined to use the normal bot brain. */
  botAction?(table: TableState, bot: BotProfile): TableAction | null | undefined;
  /** Rigged deck for a round (tutorial); undefined = shuffled. */
  deck?(roundNumber: number): Card[] | undefined;
  /** Called after every change (tutorial steps watch the events). */
  onChange?(table: TableState, events: GameLogEvent[]): void;
  /** Bots wait before acting (tutorial pauses them while the coach talks). */
  botsPaused?(): boolean;
}

const emptyStats = (): PlayerStats => ({
  roundsPlayed: 0,
  roundsWon: 0,
  biggestPotWon: 0,
  bestHand: null,
});

const randomInt = (n: number) => Math.floor(Math.random() * n);

class LocalGame {
  table: TableState;
  private log: LogEntry[] = [];
  private version = 0;
  private status: PublicGameState['status'] = 'active';
  private results: GameResults | null = null;
  private stats: Record<string, PlayerStats> = {};
  private chat: ChatMessage[] = [];
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private turnSince = { key: '', since: Date.now() };
  private readonly createdAt = Date.now();

  constructor(
    readonly bots: BotProfile[],
    readonly myName: string,
    readonly myAvatar: string,
    settings: Settings,
    readonly hooks: LocalHooks = {},
    readonly botDelayMs = 1100,
  ) {
    let table = createTable(settings);
    // The last bot deals the first round, so you act first.
    const order = [...bots.slice(-1), { id: ME }, ...bots.slice(0, -1)];
    for (const p of order) {
      const res = applyAction(table, { type: 'ADD_PLAYER', playerId: p.id });
      if (res.ok) table = res.state;
      this.stats[p.id] = emptyStats();
    }
    this.table = table;
  }

  start(): void {
    const store = useGame.getState();
    store.enterGame(LOCAL_CODE, ME);
    useChat.getState().applyHistory(LOCAL_CODE, []);
    this.startRound([{ type: 'GAME_STARTED' }]);
  }

  stop(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }

  private nameOf(id: string): string {
    return id === ME ? this.myName : (this.bots.find((b) => b.id === id)?.name ?? '?');
  }

  // ---------- Applying actions ----------

  private startRound(extra: GameLogEvent[] = []): Ack<unknown> {
    const deck = this.hooks.deck?.(this.table.roundNumber + 1) ?? shuffle(createDeck(), randomInt);
    return this.apply({ type: 'START_ROUND', deck }, extra);
  }

  private apply(action: TableAction, extra: GameLogEvent[] = []): Ack<unknown> {
    const res = applyAction(this.table, action);
    if (!res.ok) return { ok: false, error: { code: res.error.code, message: res.error.message } };
    this.table = res.state;
    const events: GameLogEvent[] = [...extra, ...res.events];
    const ended = events.find((e) => e.type === 'ROUND_ENDED');
    if (ended) this.recordStats();
    this.commit(events);
    // Now and then a winning bot shows off.
    if (ended?.type === 'ROUND_ENDED' && Math.random() < 0.5) {
      const winner = ended.result.winnerIds.find((id) => id !== ME);
      if (winner) {
        const emoji = ['🔥', '😏', '😂', '👏'][randomInt(4)]!;
        setTimeout(() => current === this && this.botReact(winner, emoji), 700);
      }
    }
    return { ok: true, data: null };
  }

  private recordStats(): void {
    const r = this.table.round!;
    const result = r.result!;
    for (const rp of r.players) {
      const s = (this.stats[rp.id] ??= emptyStats());
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

  private commit(events: GameLogEvent[]): void {
    const at = Date.now();
    const entries = events.filter((e) => e.type !== 'TURN').map((event) => ({ at, event }));
    this.log.push(...entries);
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
    this.version += 1;
    const actor = this.waitingOn();
    const key = actor ? `${this.table.round?.roundNumber}:${this.table.round?.phase}:${actor}` : '';
    if (key !== this.turnSince.key) this.turnSince = { key, since: at };
    const store = useGame.getState();
    store.applyPublic(this.publicState());
    store.applyPrivate({ ...privateView(this.table, ME), isHost: true });
    if (entries.length) store.handleEvents(entries);
    this.hooks.onChange?.(this.table, events);
    this.scheduleBots();
  }

  private waitingOn(): string | null {
    const r = this.table.round;
    if (this.status !== 'active' || !r) return null;
    if (r.phase === 'BETTING') return r.turnId;
    if (r.phase === 'AWAITING_SIDESHOW_RESPONSE') return r.pendingSideShow?.targetId ?? null;
    return null;
  }

  /** Re-send the current state (e.g. after the tutorial unpauses the bots). */
  refresh(): void {
    this.scheduleBots();
  }

  private scheduleBots(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    const who = this.waitingOn();
    const bot = this.bots.find((b) => b.id === who);
    if (!bot || this.hooks.botsPaused?.()) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.hooks.botsPaused?.() || this.waitingOn() !== bot.id) return;
      const scripted = this.hooks.botAction?.(this.table, bot);
      const action = scripted === undefined ? botMove(this.table, bot) : scripted;
      if (!action) return;
      const res = this.apply(action);
      // A bot's random choice should always be legal; fall back to packing if not.
      if (!res.ok) this.apply({ type: 'PACK', playerId: bot.id });
    }, this.botDelayMs);
  }

  // ---------- What the "server" sends ----------

  publicState(): PublicGameState {
    const now = Date.now();
    const actor = this.waitingOn();
    return {
      code: LOCAL_CODE,
      status: this.status,
      version: this.version,
      hostPlayerId: ME,
      paused: false,
      createdAt: this.createdAt,
      serverNow: now,
      players: this.table.players.map((tp) => {
        const bot = this.bots.find((b) => b.id === tp.id);
        return {
          id: tp.id,
          name: bot ? bot.name : this.myName,
          avatar: bot ? bot.avatar : this.myAvatar,
          isOffline: false,
          connected: true,
          seat: tp.seat,
          balance: tp.balance,
          totalBuyIn: tp.totalBuyIn,
          present: tp.present,
        };
      }),
      table: publicView(this.table),
      timer: null,
      turn: actor ? { playerId: actor, since: this.turnSince.since } : null,
      lastNudgeAt: null,
      pendingUndo: null,
      hostTransferOffer: null,
      stats: structuredClone(this.stats),
      results: this.results,
      rematchCode: null,
      log: this.log.slice(-100),
    };
  }

  // ---------- Client events ----------

  send(name: ClientEventName, raw: unknown): Ack<unknown> {
    const p = (raw ?? {}) as Record<string, unknown>;
    const veto = this.hooks.allow?.(name, p, this.table);
    if (veto) return { ok: false, error: { code: 'ILLEGAL_ACTION', message: veto } };
    switch (name) {
      case 'action:see':
        return this.apply({ type: 'SEE', playerId: ME });
      case 'action:chaal':
        return this.apply({ type: 'CHAAL', playerId: ME, amount: p.amount as number });
      case 'action:pack':
        return this.apply({ type: 'PACK', playerId: ME });
      case 'action:sideshowRequest':
        return this.apply({ type: 'SIDESHOW_REQUEST', playerId: ME });
      case 'action:sideshowRespond':
        return this.apply({ type: 'SIDESHOW_RESPOND', playerId: ME, accept: p.accept as boolean });
      case 'action:show':
        return this.apply({ type: 'SHOW', playerId: ME });
      case 'round:showCards':
        return this.apply({ type: 'SHOW_MY_CARDS', playerId: ME });
      case 'round:start':
        if (isRoundInProgress(this.table)) {
          return {
            ok: false,
            error: { code: 'ROUND_IN_PROGRESS', message: 'Finish this round first.' },
          };
        }
        return this.startRound();
      case 'game:end':
        return this.end();
      case 'chat:send':
      case 'chat:react': {
        const message: ChatMessage = {
          id: this.chat.length + 1,
          at: Date.now(),
          playerId: ME,
          kind: name === 'chat:react' ? 'reaction' : p.quick ? 'quick' : 'text',
          text: (name === 'chat:react' ? p.emoji : p.text) as string,
        };
        this.chat.push(message);
        useChat.getState().receive(LOCAL_CODE, message);
        return { ok: true, data: message };
      }
      case 'game:reconnect':
      case 'push:subscribe':
      case 'push:unsubscribe':
        return { ok: true, data: null };
      default:
        return { ok: false, error: { code: 'ILLEGAL_ACTION', message: t.practice.notHere } };
    }
  }

  private end(): Ack<unknown> {
    if (isRoundInProgress(this.table)) this.apply({ type: 'CANCEL_ROUND' });
    const nets = computeNets(this.table.players);
    this.results = {
      endedAt: Date.now(),
      rankings: rankByNet(nets).map((n) => {
        const tp = this.table.players.find((x) => x.id === n.id)!;
        const bot = this.bots.find((b) => b.id === n.id);
        return {
          playerId: n.id,
          name: bot ? bot.name : this.myName,
          avatar: bot ? bot.avatar : this.myAvatar,
          net: n.net,
          balance: tp.balance,
          totalBuyIn: tp.totalBuyIn,
          ...(this.stats[n.id] ?? emptyStats()),
        };
      }),
      payments: settle(nets),
      chipRate: null,
    };
    this.status = 'ended';
    this.stop();
    this.commit([{ type: 'GAME_ENDED' }]);
    return { ok: true, data: this.results };
  }

  /** A bot "says" something (reactions after big moments). */
  botReact(botId: string, emoji: string): void {
    const message: ChatMessage = {
      id: this.chat.length + 1,
      at: Date.now(),
      playerId: botId,
      kind: 'reaction',
      text: emoji,
    };
    this.chat.push(message);
    useChat.getState().receive(LOCAL_CODE, message);
  }

  get name(): string {
    return this.nameOf(ME);
  }
}

let current: LocalGame | null = null;

export function localGame(): LocalGame | null {
  return current;
}

/** Header label of the running local game ("Practice vs bots" / "Tutorial"). */
export let localLabel = '';

export function startLocalGame(opts: {
  label: string;
  bots: BotProfile[];
  name: string;
  avatar: string;
  settings?: Partial<Settings>;
  hooks?: LocalHooks;
  botDelayMs?: number;
}): LocalGame {
  current?.stop();
  localLabel = opts.label;
  const settings: Settings = {
    ...defaultSettings('digital'),
    turnTimerSec: null,
    ...opts.settings,
  };
  current = new LocalGame(opts.bots, opts.name, opts.avatar, settings, opts.hooks, opts.botDelayMs);
  current.start();
  return current;
}

export function stopLocalGame(): void {
  current?.stop();
  current = null;
  useGame.getState().leaveGame();
}
