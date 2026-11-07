import type {
  Ack,
  ChatDelivery,
  ChatHistory,
  ClientEventName,
  ClientEventPayload,
  EventBatch,
  PrivateGameState,
  PublicGameState,
  ServerError,
} from '@tpc/shared';
import { io, type Socket } from 'socket.io-client';
import { t } from '../i18n';
import { useChat } from '../store/chat';
import { useGame } from '../store/game';
import { SERVER_URL } from './config';
import { getSeat } from './storage';

let socket: Socket | null = null;

const ACK_TIMEOUT_MS = 10_000;

export function getSocket(): Socket {
  if (socket) return socket;
  const s = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
  const store = useGame.getState;

  s.on('connect', () => {
    store().setConnection('connected');
    // Re-attach to the current game after any reconnect (network drop, server restart).
    const code = store().code;
    const seat = code ? getSeat(code) : undefined;
    if (code && seat) void reconnect(code, seat.playerToken);
  });
  s.on('disconnect', () => store().setConnection('disconnected'));
  s.io.on('reconnect_attempt', () => store().setConnection('connecting'));
  s.on('state:public', (state: PublicGameState) => store().applyPublic(state));
  s.on('state:private', (state: PrivateGameState) => store().applyPrivate(state));
  s.on('event', (batch: EventBatch) => store().handleEvents(batch.entries));
  s.on('error', (err: ServerError) => store().pushError(err.message));
  s.on('chat:history', (h: ChatHistory) => {
    if (h.code === store().code) useChat.getState().applyHistory(h.code, h.messages);
  });
  s.on('chat', (d: ChatDelivery) => {
    if (d.code === store().code) useChat.getState().receive(d.code, d.message);
  });
  socket = s;
  return s;
}

/** Emit an event and wait for the server's ack. Never rejects. */
export function send<E extends ClientEventName, T = unknown>(
  name: E,
  payload: ClientEventPayload<E> | Record<string, never> = {},
): Promise<Ack<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    if (!s.connected) {
      resolve({ ok: false, error: { code: 'INTERNAL', message: t.errors.offline } });
      return;
    }
    s.timeout(ACK_TIMEOUT_MS).emit(name, payload, (err: Error | null, ack: Ack<T>) => {
      if (err) resolve({ ok: false, error: { code: 'INTERNAL', message: t.errors.timeout } });
      else resolve(ack);
    });
  });
}

/** Like `send`, but shows the error as a toast. Returns the data or null. */
export async function act<E extends ClientEventName, T = unknown>(
  name: E,
  payload: ClientEventPayload<E> | Record<string, never> = {},
): Promise<T | null> {
  const ack = await send<E, T>(name, payload);
  if (!ack.ok) {
    useGame.getState().pushError(ack.error.message);
    return null;
  }
  return ack.data;
}

export async function reconnect(code: string, playerToken: string): Promise<Ack<unknown>> {
  return send('game:reconnect', { code, playerToken });
}
