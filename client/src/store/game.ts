import type { LogEntry, PrivateGameState, PublicGameState } from '@tpc/shared';
import { create } from 'zustand';
import { t } from '../i18n';
import { describeEvent, TOAST_EVENTS } from '../lib/events';
import { haptics } from '../lib/haptics';

export type Connection = 'connecting' | 'connected' | 'disconnected';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface GameStore {
  connection: Connection;
  /** The game this tab is looking at. */
  code: string | null;
  playerId: string | null;
  pub: PublicGameState | null;
  priv: PrivateGameState | null;
  /** serverNow - Date.now(), to show server timers correctly. */
  clockOffset: number;
  toasts: Toast[];
  /** On the table screen toasts render in the felt centre instead of over the seats. */
  inlineToasts: boolean;
  kicked: boolean;

  setConnection(c: Connection): void;
  enterGame(code: string, playerId: string): void;
  leaveGame(): void;
  applyPublic(s: PublicGameState): void;
  applyPrivate(s: PrivateGameState): void;
  handleEvents(entries: LogEntry[]): void;
  pushToast(text: string, tone?: Toast['tone']): void;
  pushError(text: string): void;
  dismissToast(id: number): void;
}

let toastId = 0;
const MAX_TOASTS = 3;
const TOAST_MS = 3200;

export const useGame = create<GameStore>((set, get) => ({
  connection: 'connecting',
  code: null,
  playerId: null,
  pub: null,
  priv: null,
  clockOffset: 0,
  toasts: [],
  inlineToasts: false,
  kicked: false,

  setConnection: (connection) => set({ connection }),

  enterGame: (code, playerId) => {
    if (get().code !== code) set({ pub: null, priv: null, kicked: false });
    set({ code, playerId });
  },

  leaveGame: () => set({ code: null, playerId: null, pub: null, priv: null }),

  applyPublic: (s) => {
    const { pub, code, playerId } = get();
    if (s.code !== code) return;
    if (pub && s.version < pub.version) return; // stale update
    const wasMyTurn = pub ? isMyTurn(pub, playerId) : false;
    set({ pub: s, clockOffset: s.serverNow - Date.now() });
    if (!wasMyTurn && isMyTurn(s, playerId)) haptics.yourTurn();
  },

  applyPrivate: (s) => {
    if (s.playerId !== get().playerId) return;
    set({ priv: s });
  },

  handleEvents: (entries) => {
    const { pub, playerId } = get();
    const known = new Set(pub?.players.map((p) => p.id));
    const nameOf = (id: string) =>
      id === playerId ? t.common.you : (pub?.players.find((p) => p.id === id)?.name ?? '?');
    for (const { event } of entries) {
      // Events about players this client hasn't seen yet arrive before the state that names them.
      if ('playerId' in event && event.type !== 'PLAYER_JOINED' && !known.has(event.playerId))
        continue;
      if (event.type === 'YOU_WERE_KICKED') set({ kicked: true });
      if (event.type === 'TURN_OVERDUE' && event.playerId === playerId) haptics.overdue();
      if (event.type === 'ROUND_ENDED' && playerId && event.result.payouts[playerId]) haptics.win();
      if (!TOAST_EVENTS.has(event.type)) continue;
      // Don't toast your own actions back to you.
      if (
        'playerId' in event &&
        event.playerId === playerId &&
        event.type !== 'PLAYER_RECONNECTED'
      ) {
        continue;
      }
      const text = describeEvent(event, nameOf);
      if (text) get().pushToast(text);
    }
  },

  pushToast: (text, tone = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-MAX_TOASTS) });
    setTimeout(() => get().dismissToast(id), tone === 'error' ? TOAST_MS + 1500 : TOAST_MS);
  },

  pushError: (text) => get().pushToast(text, 'error'),

  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

function isMyTurn(pub: PublicGameState, playerId: string | null): boolean {
  const r = pub.table.round;
  if (!r || !playerId) return false;
  if (r.phase === 'BETTING') return r.turnId === playerId;
  if (r.phase === 'AWAITING_SIDESHOW_RESPONSE') return r.pendingSideShow?.targetId === playerId;
  return false;
}
