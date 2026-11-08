import {
  ClientEventSchemas,
  parseClientEvent,
  type Ack,
  type ChatDelivery,
  type ChatHistory,
  type ClientEventName,
  type ClientEventPayload,
  type EventBatch,
  type ServerError,
} from '@tpc/shared';
import type { Server, Socket } from 'socket.io';
import type { GameManager } from './game/manager';
import type { Result, ServerGame } from './game/types';
import { privateState, publicState } from './game/views';
import { log } from './util/log';
import { during } from './util/monitor';
import { TokenBucket } from './util/rateLimit';

interface SocketData {
  code?: string;
  playerId?: string;
}

export interface SocketOptions {
  /** Burst size and refill rate of the per-socket rate limit. */
  rateCapacity: number;
  ratePerSec: number;
  /** Extra, tighter limit for chat messages and reactions. */
  chatCapacity: number;
  chatPerSec: number;
}

const DEFAULTS: SocketOptions = {
  rateCapacity: 30,
  ratePerSec: 15,
  // A burst of 6 (e.g. a few reactions in a row), then one every 1.5 s.
  chatCapacity: 6,
  chatPerSec: 1 / 1.5,
};

const gameRoom = (code: string) => `game:${code}`;

export function registerSockets(
  io: Server,
  manager: GameManager,
  opts: Partial<SocketOptions> = {},
): void {
  const { rateCapacity, ratePerSec, chatCapacity, chatPerSec } = { ...DEFAULTS, ...opts };
  /** code → playerId → that player's sockets (a player may have several tabs). */
  const registry = new Map<string, Map<string, Set<Socket>>>();

  const socketsOf = (code: string, playerId: string) => registry.get(code)?.get(playerId);

  function sendPrivate(game: ServerGame, playerId: string): void {
    const sockets = socketsOf(game.code, playerId);
    if (!sockets?.size) return;
    const state = privateState(game, playerId);
    for (const s of sockets) s.emit('state:private', state);
  }

  manager.onChange = (game, entries) => {
    io.to(gameRoom(game.code)).emit('state:public', publicState(game, manager.opts.now()));
    for (const playerId of registry.get(game.code)?.keys() ?? []) sendPrivate(game, playerId);
    if (entries.length > 0) {
      const batch: EventBatch = { entries };
      io.to(gameRoom(game.code)).emit('event', batch);
    }
  };

  manager.onChat = (game, message) => {
    const delivery: ChatDelivery = { code: game.code, message };
    io.to(gameRoom(game.code)).emit('chat', delivery);
  };

  manager.onKick = (code, playerId) => {
    const sockets = socketsOf(code, playerId);
    for (const s of [...(sockets ?? [])]) {
      const batch: EventBatch = {
        entries: [{ at: Date.now(), event: { type: 'YOU_WERE_KICKED' } }],
      };
      s.emit('event', batch);
      unbind(s, true);
    }
  };

  function bind(socket: Socket, code: string, playerId: string): void {
    const data = socket.data as SocketData;
    // Re-binding the same seat (e.g. join, then reconnect on page load) must not
    // flicker the player to "disconnected" and back.
    if (data.code !== code || data.playerId !== playerId) unbind(socket, true);
    data.code = code;
    data.playerId = playerId;
    void socket.join(gameRoom(code));
    let players = registry.get(code);
    if (!players) registry.set(code, (players = new Map()));
    let set = players.get(playerId);
    if (!set) players.set(playerId, (set = new Set()));
    set.add(socket);
    const game = manager.getGame(code);
    if (!game) return;
    // Send this socket the current state right away (setConnected only broadcasts on change).
    socket.emit('state:public', publicState(game, manager.opts.now()));
    socket.emit('state:private', privateState(game, playerId));
    // Everything said while this socket was away (or before it joined).
    const history: ChatHistory = { code, messages: game.chat };
    socket.emit('chat:history', history);
    manager.setConnected(code, playerId, true);
  }

  function unbind(socket: Socket, markDisconnected: boolean): void {
    const data = socket.data as SocketData;
    const { code, playerId } = data;
    if (!code || !playerId) return;
    void socket.leave(gameRoom(code));
    data.code = undefined;
    data.playerId = undefined;
    const players = registry.get(code);
    const set = players?.get(playerId);
    set?.delete(socket);
    if (set && set.size === 0) {
      players!.delete(playerId);
      if (players!.size === 0) registry.delete(code);
      if (markDisconnected) manager.setConnected(code, playerId, false);
    }
  }

  io.on('connection', (socket) => {
    const bucket = new TokenBucket(rateCapacity, ratePerSec);
    const chatBucket = new TokenBucket(chatCapacity, chatPerSec);

    for (const name of Object.keys(ClientEventSchemas) as ClientEventName[]) {
      socket.on(name, async (payload: unknown, maybeAck?: unknown) => {
        await manager.ready; // no game events while games are still being restored
        let ack = maybeAck;
        if (typeof payload === 'function') {
          ack = payload;
          payload = {};
        }
        const reply = (result: Result<unknown>) => {
          const out: Ack<unknown> = result;
          if (typeof ack === 'function') (ack as (a: Ack<unknown>) => void)(out);
          else if (!result.ok) socket.emit('error', result.error);
        };
        const error = (code: ServerError['code'], message: string) =>
          reply({ ok: false, error: { code, message } });

        if (!bucket.take()) return error('RATE_LIMITED', 'Slow down a little.');
        const parsed = parseClientEvent(name, payload);
        if (!parsed.ok) return error('INVALID_PAYLOAD', parsed.message);
        if (name.startsWith('chat:') && !chatBucket.take()) {
          return error('RATE_LIMITED', "You're sending messages too fast. Wait a moment.");
        }

        try {
          const data = socket.data as SocketData;
          switch (name) {
            case 'game:create': {
              const p = parsed.data as ClientEventPayload<'game:create'>;
              const res = await manager.createGame(p);
              if (res.ok) bind(socket, res.data.code, res.data.playerId);
              return reply(res);
            }
            case 'game:join': {
              const p = parsed.data as ClientEventPayload<'game:join'>;
              const res = await manager.joinGame(p.code, p);
              if (res.ok) bind(socket, res.data.code, res.data.playerId);
              return reply(res);
            }
            case 'game:reconnect': {
              const p = parsed.data as ClientEventPayload<'game:reconnect'>;
              const res = await manager.reconnect(p.code, p.playerToken);
              if (res.ok) bind(socket, res.data.code, res.data.playerId);
              return reply(res);
            }
            case 'game:rematch': {
              if (!data.code || !data.playerId) {
                return error('NOT_IN_GAME', 'Join a game first.');
              }
              const res = await manager.rematch(data.code, data.playerId);
              if (res.ok) bind(socket, res.data.code, res.data.playerId);
              return reply(res);
            }
            default: {
              if (!data.code || !data.playerId) {
                return error('NOT_IN_GAME', 'Join a game first.');
              }
              const res = during(`socket:${name} ${data.code}`, () =>
                manager.handle(data.code!, data.playerId!, name, parsed.data),
              );
              if (res.ok && name === 'game:leave') unbind(socket, false);
              return reply(res);
            }
          }
        } catch (e) {
          log.error(`handler ${name} failed`, e);
          return error('INTERNAL', 'Something went wrong. Please try again.');
        }
      });
    }

    socket.on('disconnect', () => unbind(socket, true));
  });
}
