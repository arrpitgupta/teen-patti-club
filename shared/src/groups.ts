import { z } from 'zod';
import type { Card } from './cards/cards';
import type { Settings } from './games/teenPatti/settings';
import { SettingsSchema } from './games/teenPatti/settings';
import type { GameResults, GameStatus } from './protocol';

/** Long random ids for links that must not be guessable (results pages, groups): 128 bits. */
export const SecretIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, 'That link is not valid.');

export const GroupNameSchema = z.string().trim().min(1, 'Give the group a name.').max(30);
/** A group keeps at most this many members (names). */
export const GROUP_MEMBER_LIMIT = 200;

export const GroupCreateSchema = z
  .object({ name: GroupNameSchema, settings: SettingsSchema })
  .strict();
export const GroupUpdateSchema = z
  .object({ name: GroupNameSchema.optional(), settings: SettingsSchema.optional() })
  .strict();

export interface GroupMember {
  id: string;
  name: string;
  avatar: string;
}

/** One game played by the group, as shown on the group page. */
export interface GroupGameRow {
  code: string;
  resultsId: string | null;
  status: GameStatus;
  mode: Settings['mode'];
  createdAt: number;
  endedAt: number | null;
  roundNumber: number;
  /** Ended games: in final ranking order. Open games: in join order with net so far. */
  players: { memberId: string | null; name: string; avatar: string; net: number }[];
}

/** GET /api/groups/:id */
export interface GroupInfo {
  id: string;
  name: string;
  /** The group's house rules: new games from the group start with these. */
  settings: Settings;
  members: GroupMember[];
  createdAt: number;
  /** Newest first. */
  games: GroupGameRow[];
}

/** What a joining player sees about a group game (no group link). */
export interface GroupJoinInfo {
  name: string;
  members: (GroupMember & { taken: boolean })[];
}

export interface LeaderRow {
  memberId: string;
  name: string;
  avatar: string;
  games: number;
  /** Games finished in first place with a positive net. */
  wins: number;
  net: number;
  /** Best single-game net. */
  best: number;
}

/**
 * Leaderboard over the group's ended games (optionally only those that ended at or after
 * `since`). Names and avatars come from the member list so renamed seats still add up.
 */
export function groupLeaderboard(
  games: GroupGameRow[],
  members: GroupMember[],
  since = 0,
): LeaderRow[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = new Map<string, LeaderRow>();
  for (const g of games) {
    if (g.status !== 'ended' || g.endedAt === null || g.endedAt < since) continue;
    const seen = new Set<string>();
    g.players.forEach((p, place) => {
      if (!p.memberId) return;
      const m = byId.get(p.memberId);
      let row = rows.get(p.memberId);
      if (!row) {
        row = {
          memberId: p.memberId,
          name: m?.name ?? p.name,
          avatar: m?.avatar ?? p.avatar,
          games: 0,
          wins: 0,
          net: 0,
          best: Number.NEGATIVE_INFINITY,
        };
        rows.set(p.memberId, row);
      }
      // One member may have had two seats in a game (e.g. a new phone); count the game once.
      if (!seen.has(p.memberId)) row.games += 1;
      seen.add(p.memberId);
      row.net += p.net;
      row.best = Math.max(row.best, p.net);
      if (place === 0 && p.net > 0) row.wins += 1;
    });
  }
  return [...rows.values()]
    .map((r) => ({ ...r, best: Number.isFinite(r.best) ? r.best : 0 }))
    .sort(
      (a, b) =>
        b.net - a.net || b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name),
    );
}

/** Start of the calendar month containing `now` (local time of whoever calls it). */
export function monthStart(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** One finished round on the public results page. */
export interface RoundLog {
  roundNumber: number;
  boot: number;
  pot: number;
  reason: string;
  winnerIds: string[];
  winningHand: string | null;
  /** Hands shown at a show / side show / comparison. */
  revealedHands: Record<string, Card[]>;
  /** Hands players chose to show after the round ("Show my cards"). */
  shownHands: Record<string, Card[]>;
  actions: { playerId: string | null; type: string; amount: number | null; potAfter: number }[];
  resolution: string;
  endedAt: number;
}

/** GET /api/results/:id — read-only, safe to share (no tokens, no group link). */
export interface ResultsPage {
  code: string;
  status: GameStatus;
  mode: Settings['mode'];
  createdAt: number;
  endedAt: number | null;
  roundNumber: number;
  players: { id: string; name: string; avatar: string; balance: number; net: number }[];
  results: GameResults | null;
  rounds: RoundLog[];
  groupName: string | null;
}
