import type { ChatMessage } from '@tpc/shared';
import { create } from 'zustand';
import { t } from '../i18n';
import { getChatRead, getPrefs, savePrefs, saveChatRead } from '../lib/storage';
import { useGame } from './game';

/** How long a reaction / preset line floats over the sender's seat. */
export const FLOAT_MS = 2200;

export interface Float {
  /** The message id, so a new float restarts the animation. */
  id: number;
  kind: 'quick' | 'reaction';
  text: string;
}

interface ChatStore {
  code: string | null;
  messages: ChatMessage[];
  /** Last message id the player has seen in the drawer. */
  readId: number;
  open: boolean;
  muted: boolean;
  /** playerId → what is floating over their seat right now. */
  floats: Record<string, Float>;

  applyHistory(code: string, messages: ChatMessage[]): void;
  receive(code: string, message: ChatMessage): void;
  setOpen(open: boolean): void;
  setMuted(muted: boolean): void;
  markRead(): void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Messages that count towards the unread badge: typed ones from other players. */
export function unreadCount(s: Pick<ChatStore, 'messages' | 'readId'>, me: string | null): number {
  let n = 0;
  for (const m of s.messages) if (m.id > s.readId && m.kind === 'text' && m.playerId !== me) n++;
  return n;
}

export const useChat = create<ChatStore>((set, get) => ({
  code: null,
  messages: [],
  readId: 0,
  open: false,
  muted: getPrefs().chatMuted,
  floats: {},

  applyHistory: (code, messages) => {
    const s = get();
    const same = s.code === code;
    // Merge by id: history is the source of truth, but keep anything that arrived in between.
    const byId = new Map<number, ChatMessage>();
    for (const m of same ? s.messages : []) byId.set(m.id, m);
    for (const m of messages) byId.set(m.id, m);
    const merged = [...byId.values()].sort((a, b) => a.id - b.id);
    set({
      code,
      messages: merged,
      readId: same ? s.readId : getChatRead(code),
      floats: same ? s.floats : {},
    });
    if (get().open) get().markRead();
  },

  receive: (code, message) => {
    const s = get();
    if (s.code !== code) {
      // First message before the history arrived (rare): start the list with it.
      get().applyHistory(code, [message]);
    } else if (!s.messages.some((m) => m.id === message.id)) {
      set({ messages: [...s.messages, message] });
    } else {
      return;
    }
    const me = useGame.getState().playerId;
    const { muted, open } = get();
    if (open) get().markRead();
    if (muted) return;

    if (message.kind === 'reaction' || message.kind === 'quick') {
      const pid = message.playerId;
      set({
        floats: {
          ...get().floats,
          [pid]: { id: message.id, kind: message.kind, text: message.text },
        },
      });
      clearTimeout(timers.get(pid));
      timers.set(
        pid,
        setTimeout(() => {
          const { [pid]: _gone, ...rest } = get().floats;
          set({ floats: rest });
        }, FLOAT_MS),
      );
    } else if (message.playerId !== me && !open) {
      const name =
        useGame.getState().pub?.players.find((p) => p.id === message.playerId)?.name ?? '?';
      useGame.getState().pushToast(t.chat.toast(name, message.text));
    }
  },

  setOpen: (open) => {
    set({ open });
    if (open) get().markRead();
  },

  setMuted: (muted) => {
    set({ muted, floats: muted ? {} : get().floats });
    savePrefs({ ...getPrefs(), chatMuted: muted });
  },

  markRead: () => {
    const { code, messages, readId } = get();
    const last = messages.at(-1)?.id ?? 0;
    if (!code || last <= readId) return;
    set({ readId: last });
    saveChatRead(code, last);
  },
}));
