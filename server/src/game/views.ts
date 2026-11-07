import {
  computeNets,
  privateView,
  publicView,
  type GameSummary,
  type PrivateGameState,
  type PublicGameState,
} from '@tpc/shared';
import type { GameSnapshot } from '../store/types';
import type { ServerGame } from './types';

const LOG_TAIL = 100;

/** Same for everyone at the table. Never contains hidden cards. */
export function publicState(game: ServerGame, now: number): PublicGameState {
  return {
    code: game.code,
    status: game.status,
    version: game.version,
    hostPlayerId: game.hostPlayerId,
    paused: game.paused,
    createdAt: game.createdAt,
    serverNow: now,
    players: game.players.map((p) => {
      const tp = game.table.players.find((x) => x.id === p.id);
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isOffline: p.isOffline,
        connected: p.isOffline ? false : p.connected,
        seat: tp?.seat ?? -1,
        balance: tp?.balance ?? 0,
        totalBuyIn: tp?.totalBuyIn ?? 0,
        present: (tp?.present ?? false) && p.leftAt === null,
      };
    }),
    table: publicView(game.table),
    timer: game.timer
      ? {
          playerId: game.timer.playerId,
          kind: game.timer.kind,
          deadline: game.timer.deadline,
          durationMs: game.timer.durationMs,
        }
      : null,
    turn: game.turn ? { playerId: game.turn.playerId, since: game.turn.since } : null,
    lastNudgeAt: game.lastNudgeAt,
    pendingUndo: game.pendingUndo ? { ...game.pendingUndo } : null,
    hostTransferOffer: game.hostTransferOffer ? { ...game.hostTransferOffer } : null,
    stats: structuredClone(game.stats),
    results: game.results ? structuredClone(game.results) : null,
    rematchCode: game.rematch?.code ?? null,
    log: game.log.slice(-LOG_TAIL),
  };
}

/** Only for this player's own sockets. */
export function privateState(game: ServerGame, playerId: string): PrivateGameState {
  return { ...privateView(game.table, playerId), isHost: game.hostPlayerId === playerId };
}

export function summaryFromSnapshot(s: GameSnapshot): GameSummary {
  const nets = new Map(computeNets(s.currentRoundState.players).map((n) => [n.id, n.net]));
  return {
    code: s.code,
    status: s.status,
    mode: s.mode,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    roundNumber: s.currentRoundState.roundNumber,
    players: s.players.map((p) => {
      const tp = s.currentRoundState.players.find((x) => x.id === p.id);
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        balance: tp?.balance ?? 0,
        net: nets.get(p.id) ?? 0,
      };
    }),
    results: s.results,
  };
}
