import {
  computeNets,
  privateView,
  publicView,
  type GameSummary,
  type GroupGameRow,
  type ResultsPage,
  type RoundLog,
  type PrivateGameState,
  type PublicGameState,
} from '@tpc/shared';
import type { GameSnapshot, GroupGameSnapshot, RoundRecord } from '../store/types';
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
    resultsId: game.resultsId,
    group: game.group ? { ...game.group } : null,
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
    resultsId: s.resultsId ?? null,
  };
}

/** A game as a row on the group page: final ranking order once ended, nets so far before. */
export function groupGameRow(s: GroupGameSnapshot): GroupGameRow {
  const memberOf = new Map(s.players.map((p) => [p.id, p.memberId ?? null]));
  const players = s.results
    ? s.results.rankings.map((r) => ({
        memberId: memberOf.get(r.playerId) ?? null,
        name: r.name,
        avatar: r.avatar,
        net: r.net,
      }))
    : (() => {
        const nets = new Map(computeNets(s.currentRoundState.players).map((n) => [n.id, n.net]));
        return s.players
          .filter((p) => p.leftAt === null || nets.get(p.id))
          .map((p) => ({
            memberId: p.memberId ?? null,
            name: p.name,
            avatar: p.avatar,
            net: nets.get(p.id) ?? 0,
          }));
      })();
  return {
    code: s.code,
    resultsId: s.resultsId ?? null,
    status: s.status,
    mode: s.mode,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    roundNumber: s.currentRoundState.roundNumber,
    players,
  };
}

export function roundLog(r: RoundRecord): RoundLog {
  return {
    roundNumber: r.roundNumber,
    boot: r.boot,
    pot: r.pot,
    reason: r.reason,
    winnerIds: r.winnerIds,
    winningHand: r.winningHand,
    revealedHands: (r.revealedHands ?? {}) as RoundLog['revealedHands'],
    shownHands: (r.shownHands ?? {}) as RoundLog['shownHands'],
    actions: (r.actions ?? []).map((a) => ({
      playerId: a.playerId,
      type: a.type,
      amount: a.amount,
      potAfter: a.potAfter,
    })),
    resolution: r.resolution,
    endedAt: r.endedAt,
  };
}

export function resultsPage(
  s: GameSnapshot,
  rounds: RoundRecord[],
  groupName: string | null,
): ResultsPage {
  const summary = summaryFromSnapshot(s);
  return {
    code: s.code,
    status: s.status,
    mode: s.mode,
    createdAt: s.createdAt,
    endedAt: s.endedAt,
    roundNumber: summary.roundNumber,
    players: summary.players,
    results: s.results,
    rounds: rounds.map(roundLog),
    groupName,
  };
}
