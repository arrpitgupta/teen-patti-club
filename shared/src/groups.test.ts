import { describe, expect, it } from 'vitest';
import { groupLeaderboard, monthStart, SecretIdSchema, type GroupGameRow } from './groups';

const members = [
  { id: 'm1', name: 'Aman', avatar: 'a' },
  { id: 'm2', name: 'Neha', avatar: 'b' },
  { id: 'm3', name: 'Ravi', avatar: 'c' },
];

const game = (
  endedAt: number | null,
  players: [string | null, number][],
  status: GroupGameRow['status'] = 'ended',
): GroupGameRow => ({
  code: 'ABCDEF',
  resultsId: null,
  status,
  mode: 'digital',
  createdAt: 0,
  endedAt,
  roundNumber: 3,
  players: players.map(([memberId, net]) => ({
    memberId,
    name: `old-${memberId}`,
    avatar: 'x',
    net,
  })),
});

describe('groupLeaderboard', () => {
  it('adds up nets, wins and games per member across ended games', () => {
    const rows = groupLeaderboard(
      [
        game(100, [
          ['m1', 50],
          ['m2', -20],
          ['m3', -30],
        ]),
        game(200, [
          ['m2', 40],
          ['m1', -40],
        ]),
        game(null, [['m3', 999]], 'active'),
      ],
      members,
    );
    expect(rows.map((r) => [r.memberId, r.net, r.wins, r.games, r.best])).toEqual([
      ['m2', 20, 1, 2, 40],
      ['m1', 10, 1, 2, 50],
      ['m3', -30, 0, 1, -30],
    ]);
    // Names come from the member list, not the seat name used in the game.
    expect(rows[0]!.name).toBe('Neha');
    expect(rows.reduce((s, r) => s + r.net, 0)).toBe(0);
  });

  it('filters by month and ignores seats without a member', () => {
    const rows = groupLeaderboard(
      [
        game(100, [
          ['m1', 50],
          [null, -50],
        ]),
        game(500, [
          ['m2', 10],
          ['m1', -10],
        ]),
      ],
      members,
      300,
    );
    expect(rows.map((r) => [r.memberId, r.net])).toEqual([
      ['m2', 10],
      ['m1', -10],
    ]);
  });

  it('counts a member with two seats in one game once', () => {
    const rows = groupLeaderboard(
      [
        game(1, [
          ['m1', 30],
          ['m2', -10],
          ['m1', -20],
        ]),
      ],
      members,
    );
    expect(rows.find((r) => r.memberId === 'm1')).toMatchObject({ games: 1, net: 10, wins: 1 });
  });
});

describe('helpers', () => {
  it('monthStart is the first of the month', () => {
    const d = new Date(monthStart(new Date(2026, 10, 18, 15).getTime()));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 1, 0]);
  });
  it('secret ids are 22 url-safe characters', () => {
    expect(SecretIdSchema.safeParse('a'.repeat(22)).success).toBe(true);
    expect(SecretIdSchema.safeParse('ABCDEF').success).toBe(false);
    expect(SecretIdSchema.safeParse('a'.repeat(21) + '/').success).toBe(false);
  });
});
