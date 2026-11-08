import {
  ENGINE_VERSION,
  GameCodeSchema,
  GroupCreateSchema,
  GroupUpdateSchema,
  SecretIdSchema,
  type GroupInfo,
  type GroupJoinInfo,
} from '@tpc/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { GameManager } from './game/manager';
import { groupGameRow, resultsPage, summaryFromSnapshot } from './game/views';
import type { GameSnapshot, GameStore, GroupRecord } from './store/types';
import { hashToken } from './util/crypto';
import { TokenBucket } from './util/rateLimit';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

const MAX_HISTORY_TOKENS = 50;
const GROUP_GAMES_LIMIT = 300;

export interface RouteOptions {
  /** New groups per IP: burst, then this many per minute. */
  groupCreateBurst: number;
  groupCreatePerMinute: number;
  /** Deployed commit, shown by /health. */
  buildId: string | null;
}

const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  groupCreateBurst: 10,
  groupCreatePerMinute: 2,
  buildId: null,
};

export function createRoutes(
  store: GameStore,
  manager: GameManager,
  options: Partial<RouteOptions> = {},
): Router {
  const opts = { ...DEFAULT_ROUTE_OPTIONS, ...options };
  const router = Router();
  const createBuckets = new Map<string, TokenBucket>();

  /** Prefer the live game over the (debounced) stored snapshot. */
  const freshest = (snap: GameSnapshot): GameSnapshot => manager.liveSnapshot(snap.code) ?? snap;

  const groupInfo = async (group: GroupRecord): Promise<GroupInfo> => {
    const stored = await store.listGroupGames(group.id, GROUP_GAMES_LIMIT);
    const byCode = new Map<string, (typeof stored)[number]>(stored.map((g) => [g.code, g]));
    for (const code of manager.liveGroupCodes(group.id)) {
      const live = manager.liveSnapshot(code);
      if (live) byCode.set(code, live);
    }
    const games = [...byCode.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, GROUP_GAMES_LIMIT)
      .map(groupGameRow);
    return {
      id: group.id,
      name: group.name,
      settings: group.settings,
      members: group.members.map(({ id, name, avatar }) => ({ id, name, avatar })),
      createdAt: group.createdAt,
      games,
    };
  };

  // Game data waits until restored games are back in memory (/health does not).
  router.use('/api', (_req, _res, next) => {
    manager.ready.then(() => next(), next);
  });

  const badRequest = (res: Response, message: string) => {
    res.status(400).json({ error: message });
  };
  const noGroup = (res: Response) => {
    res.status(404).json({ error: "That group doesn't exist." });
  };

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      engine: ENGINE_VERSION,
      build: opts.buildId,
      push: manager.opts.push !== null,
      restoring: manager.restoring,
      needsAttention: manager.skipped.size,
      uptime: process.uptime(),
      games: manager.gameCount,
    });
  });

  router.get(
    '/api/games/:code',
    wrap(async (req, res) => {
      const code = GameCodeSchema.safeParse(req.params.code);
      if (!code.success) return badRequest(res, 'Invalid game code.');
      const stored = await store.findGame(code.data);
      if (!stored) {
        res.status(404).json({ error: "That game doesn't exist." });
        return;
      }
      const snap = freshest(stored);
      // Group games: members a joining player can pick from (but not the group link).
      let group: GroupJoinInfo | null = null;
      const g = snap.groupId ? await manager.groups.load(snap.groupId) : null;
      if (g) {
        const seated = new Set(
          snap.players.filter((p) => p.leftAt === null && p.memberId).map((p) => p.memberId),
        );
        group = {
          name: g.name,
          members: g.members.map(({ id, name, avatar }) => ({
            id,
            name,
            avatar,
            taken: seated.has(id),
          })),
        };
      }
      res.json({ ...summaryFromSnapshot(snap), group });
    }),
  );

  // Read-only results page (/r/<id>): safe to share, so no tokens and no group link.
  router.get(
    '/api/results/:id',
    wrap(async (req, res) => {
      const id = SecretIdSchema.safeParse(req.params.id);
      const stored = id.success ? await store.findGameByResultsId(id.data) : null;
      if (!stored) {
        res.status(404).json({ error: 'These results do not exist.' });
        return;
      }
      const snap = freshest(stored);
      const group = snap.groupId ? await manager.groups.load(snap.groupId) : null;
      const rounds = await store.listRounds(snap.code);
      res.json(resultsPage(snap, rounds, group?.name ?? null));
    }),
  );

  router.post(
    '/api/groups',
    wrap(async (req, res) => {
      const ip = req.ip ?? 'unknown';
      let bucket = createBuckets.get(ip);
      if (!bucket) {
        if (createBuckets.size > 10_000) createBuckets.clear();
        bucket = new TokenBucket(opts.groupCreateBurst, opts.groupCreatePerMinute / 60);
        createBuckets.set(ip, bucket);
      }
      if (!bucket.take()) {
        res.status(429).json({ error: 'Too many new groups. Try again in a few minutes.' });
        return;
      }
      const body = GroupCreateSchema.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues[0]?.message ?? 'Invalid group.');
      const group = await manager.groups.create(body.data.name, body.data.settings);
      res.status(201).json(await groupInfo(group));
    }),
  );

  router.get(
    '/api/groups/:id',
    wrap(async (req, res) => {
      const id = SecretIdSchema.safeParse(req.params.id);
      const group = id.success ? await manager.groups.load(id.data) : null;
      if (!group) return noGroup(res);
      res.json(await groupInfo(group));
    }),
  );

  // Anyone with the group link may change its name or house rules.
  router.patch(
    '/api/groups/:id',
    wrap(async (req, res) => {
      const id = SecretIdSchema.safeParse(req.params.id);
      const body = GroupUpdateSchema.safeParse(req.body);
      if (!body.success) return badRequest(res, body.error.issues[0]?.message ?? 'Invalid group.');
      const group = id.success ? await manager.groups.update(id.data, body.data) : null;
      if (!group) return noGroup(res);
      if (body.data.name !== undefined) manager.renameGroupInGames(group.id, group.name);
      res.json(await groupInfo(group));
    }),
  );

  // Public VAPID key for "your turn" notifications (404 when push is off).
  router.get('/api/push/key', (_req, res) => {
    const key = manager.opts.push?.publicKey;
    if (key) res.json({ publicKey: key });
    else res.status(404).json({ error: 'Notifications are not set up on this server.' });
  });

  router.get(
    '/api/games/:code/rounds',
    wrap(async (req, res) => {
      const code = GameCodeSchema.safeParse(req.params.code);
      if (!code.success) return badRequest(res, 'Invalid game code.');
      res.json({ rounds: await store.listRounds(code.data) });
    }),
  );

  // Tokens are sent in a header (not the URL) so they don't end up in access logs.
  router.get(
    '/api/history',
    wrap(async (req, res) => {
      const raw = req.header('x-player-tokens') ?? '';
      const tokens = raw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length >= 16 && t.length <= 128)
        .slice(0, MAX_HISTORY_TOKENS);
      const snaps = await store.findGamesByTokenHashes(tokens.map(hashToken), 50);
      res.json({ games: snaps.map(summaryFromSnapshot) });
    }),
  );

  return router;
}
