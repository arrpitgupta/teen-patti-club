import {
  groupLeaderboard,
  type GameSummary,
  type GroupInfo,
  type JoinResult,
  type Settings,
} from '@tpc/shared';
import { describe, expect, it } from 'vitest';
import { digital, startTestServer, syncAll, TestClient, until } from './test/helpers';

async function api<T>(url: string, path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

const newGroup = (url: string, settings: Settings = digital({ boot: 25 })) =>
  api<GroupInfo>(url, '/api/groups', 'POST', { name: 'Friday club', settings });

async function client(url: string, name: string) {
  const c = new TestClient(url, name);
  await c.connected();
  return c;
}

describe('groups', () => {
  it('create, read and update a group through its secret link', async () => {
    const srv = await startTestServer();
    const created = await newGroup(srv.url);
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(created.body.settings.boot).toBe(25);
    expect(created.body.games).toEqual([]);

    const id = created.body.id;
    const read = await api<GroupInfo>(srv.url, `/api/groups/${id}`);
    expect(read.body.name).toBe('Friday club');

    const patched = await api<GroupInfo>(srv.url, `/api/groups/${id}`, 'PATCH', {
      name: 'Saturday club',
      settings: digital({ boot: 50 }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ name: 'Saturday club', settings: { boot: 50 } });

    expect((await api(srv.url, `/api/groups/${'z'.repeat(22)}`)).status).toBe(404);
    expect((await api(srv.url, '/api/groups/short')).status).toBe(404);
    expect((await api(srv.url, '/api/groups', 'POST', { name: '' })).status).toBe(400);
    expect(
      (await api(srv.url, `/api/groups/${id}`, 'PATCH', { settings: { boot: -1 } })).status,
    ).toBe(400);
    await srv.stop();
  });

  it('limits how fast one address creates groups', async () => {
    const srv = await startTestServer();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await newGroup(srv.url)).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    await srv.stop();
  });

  it('group games attach automatically and seats map to members so stats add up', async () => {
    const srv = await startTestServer();
    const { body: group } = await newGroup(srv.url);

    // Game 1: Host creates from the group, Asha joins by typing her name.
    const host = await client(srv.url, 'Host');
    const g1 = await host.must<JoinResult>('game:create', {
      name: 'Host',
      avatar: '🦁',
      settings: group.settings,
      groupId: group.id,
    });
    const asha = await client(srv.url, 'Asha');
    await asha.join(g1.code);
    await host.must('host:addOfflineSeat', { name: 'Dadi', avatar: '🦉' });
    await syncAll([host, asha]);
    expect(host.pub.group).toEqual({ id: group.id, name: 'Friday club' });

    // A joining player sees the members (and who is seated) but not the group link.
    const summary = await api<GameSummary>(srv.url, `/api/games/${g1.code}`);
    expect(summary.body.group!.members.map((m) => [m.name, m.taken])).toEqual([
      ['Host', true],
      ['Asha', true],
      ['Dadi', true],
    ]);
    expect(JSON.stringify(summary.body)).not.toContain(group.id);

    await host.must('game:start');
    await asha.must('action:pack').catch(() => host.must('action:pack'));
    await host.must('game:end');
    await syncAll([host, asha]);

    let info = (await api<GroupInfo>(srv.url, `/api/groups/${group.id}`)).body;
    expect(info.members.map((m) => m.name)).toEqual(['Host', 'Asha', 'Dadi']);
    const memberId = (name: string) => info.members.find((m) => m.name === name)!.id;

    // Game 2: Asha picks her name from the list; Bilal types "host" while Host is seated
    // (a different person, so a new member); Ravi types "dadi" (free member, reused).
    const host2 = await client(srv.url, 'Host');
    const g2 = await host2.must<JoinResult>('game:create', {
      name: 'Whoever',
      avatar: '🦁',
      settings: info.settings,
      groupId: group.id,
      memberId: memberId('Host'),
    });
    const asha2 = await client(srv.url, 'Asha');
    await asha2.must('game:join', {
      code: g2.code,
      name: 'Asha',
      avatar: '🐯',
      memberId: memberId('Asha'),
    });
    // The same member can't be taken twice at one table.
    const dup = await (
      await client(srv.url, 'X')
    ).call('game:join', { code: g2.code, name: 'Asha', avatar: '🐯', memberId: memberId('Asha') });
    expect(dup.ok).toBe(false);
    const unknown = await (
      await client(srv.url, 'Y')
    ).call('game:join', { code: g2.code, name: 'Y', avatar: '🐯', memberId: 'nope' });
    expect(unknown.ok).toBe(false);
    const bilal = await client(srv.url, 'Bilal');
    await bilal.must('game:join', { code: g2.code, name: 'host', avatar: '🐯' });
    const ravi = await client(srv.url, 'Ravi');
    await ravi.must('game:join', { code: g2.code, name: 'DADI', avatar: '🐯' });

    const game2 = srv.server.manager.getGame(g2.code)!;
    expect(game2.players.map((p) => p.name)).toEqual(['Host', 'Asha', 'host', 'Dadi']);
    expect(game2.players[0]!.memberId).toBe(memberId('Host'));
    expect(game2.players[1]!.memberId).toBe(memberId('Asha'));
    expect(game2.players[3]!.memberId).toBe(memberId('Dadi'));
    expect(game2.players[2]!.memberId).not.toBe(memberId('Host'));

    await host2.must('game:start');
    await host2.must('game:end');
    await until(async () => {
      info = (await api<GroupInfo>(srv.url, `/api/groups/${group.id}`)).body;
      return info.games.filter((g) => g.status === 'ended').length === 2;
    });
    expect(info.games.map((g) => g.code)).toEqual([g2.code, g1.code]);
    const board = groupLeaderboard(info.games, info.members);
    expect(board.find((r) => r.name === 'Asha')!.games).toBe(2);
    expect(board.find((r) => r.name === 'Dadi')!.games).toBe(2);
    expect(board.reduce((s, r) => s + r.net, 0)).toBe(0);

    for (const c of [host, asha, host2, asha2, bilal, ravi]) c.close();
    await srv.stop();
  });

  it('unknown groups are rejected; renames reach live games; rematch keeps the group', async () => {
    const srv = await startTestServer();
    const host = await client(srv.url, 'Host');
    const bad = await host.call('game:create', {
      name: 'Host',
      avatar: '🦁',
      settings: digital(),
      groupId: 'q'.repeat(22),
    });
    expect(bad).toMatchObject({ ok: false, error: { code: 'GROUP_NOT_FOUND' } });

    const { body: group } = await newGroup(srv.url);
    const g = await host.must<JoinResult>('game:create', {
      name: 'Host',
      avatar: '🦁',
      settings: group.settings,
      groupId: group.id,
    });
    host.code = g.code;
    const asha = await client(srv.url, 'Asha');
    await asha.join(g.code);
    await api(srv.url, `/api/groups/${group.id}`, 'PATCH', { name: 'Renamed' });
    await host.must('game:start');
    await host.must('game:end');
    await syncAll([host, asha]);
    expect(host.pub.group?.name).toBe('Renamed');

    const next = await asha.must<JoinResult>('game:rematch');
    const rematch = srv.server.manager.getGame(next.code)!;
    expect(rematch.group?.id).toBe(group.id);
    const old = srv.server.manager.getGame(g.code)!;
    expect(rematch.players[0]!.memberId).toBe(old.players[1]!.memberId);
    host.close();
    asha.close();
    await srv.stop();
  });

  it('group membership survives a restart', async () => {
    const srv = await startTestServer();
    const { body: group } = await newGroup(srv.url);
    const host = await client(srv.url, 'Host');
    const g = await host.must<JoinResult>('game:create', {
      name: 'Host',
      avatar: '🦁',
      settings: group.settings,
      groupId: group.id,
    });
    host.close();
    await srv.stop();
    const again = await startTestServer({ dbName: srv.dbName });
    const game = again.server.manager.getGame(g.code)!;
    expect(game.group).toEqual({ id: group.id, name: 'Friday club' });
    const info = (await api<GroupInfo>(again.url, `/api/groups/${group.id}`)).body;
    expect(game.players[0]!.memberId).toBe(info.members[0]!.id);
    // Typing a name that is already a free member reuses it after the restart too.
    const asha = await client(again.url, 'host');
    const res = await asha.call('game:join', { code: g.code, name: 'Asha', avatar: '🐯' });
    expect(res.ok).toBe(true);
    asha.close();
    await again.stop();
  });
});
