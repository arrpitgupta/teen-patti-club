import { ENGINE_VERSION, GameCodeSchema } from '@tpc/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { GameManager } from './game/manager';
import { summaryFromSnapshot } from './game/views';
import type { GameStore } from './store/types';
import { hashToken } from './util/crypto';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

const MAX_HISTORY_TOKENS = 50;

export function createRoutes(store: GameStore, manager: GameManager): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      engine: ENGINE_VERSION,
      uptime: process.uptime(),
      games: manager.gameCount,
    });
  });

  router.get(
    '/api/games/:code',
    wrap(async (req, res) => {
      const code = GameCodeSchema.safeParse(req.params.code);
      if (!code.success) {
        res.status(400).json({ error: 'Invalid game code.' });
        return;
      }
      const snap = await store.findGame(code.data);
      if (!snap) {
        res.status(404).json({ error: "That game doesn't exist." });
        return;
      }
      // Prefer live balances over the (debounced) stored snapshot.
      const live = manager.getGame(code.data);
      const summary = summaryFromSnapshot(
        live
          ? { ...snap, status: live.status, currentRoundState: live.table, results: live.results }
          : snap,
      );
      res.json(summary);
    }),
  );

  router.get(
    '/api/games/:code/rounds',
    wrap(async (req, res) => {
      const code = GameCodeSchema.safeParse(req.params.code);
      if (!code.success) {
        res.status(400).json({ error: 'Invalid game code.' });
        return;
      }
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
