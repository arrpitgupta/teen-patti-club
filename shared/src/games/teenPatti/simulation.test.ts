import { describe, expect, it } from 'vitest';
import { createDeck, shuffle } from '../../cards/cards';
import { computeNets, settle } from '../../settlement/settlement';
import { legalActions } from './legal';
import { replayRound } from './round';
import type { Settings } from './settings';
import { applyAction, isRoundInProgress, planNextRound } from './table';
import { makeTable, ok } from './testUtils';
import type { TableAction, TableState } from './types';

/** Small deterministic PRNG so failures are reproducible by seed. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function checkInvariants(t: TableState): void {
  const balances = t.players.reduce((s, p) => s + p.balance, 0);
  const bought = t.players.reduce((s, p) => s + p.totalBuyIn, 0);
  const pot = isRoundInProgress(t) ? t.round!.pot : 0;
  // Chips are never created or destroyed.
  expect(balances + pot).toBe(bought);
  if (t.settings.chipMode === 'buyIn') {
    for (const p of t.players) expect(p.balance).toBeGreaterThanOrEqual(0);
  }
  if (t.round) {
    expect(t.round.stake).toBe(Math.floor(t.round.stake));
    expect(t.round.pot).toBeGreaterThanOrEqual(0);
  }
}

/** Choose a random legal move for whoever needs to act. */
function randomMove(t: TableState, rng: () => number): TableAction {
  const r = t.round!;
  if (r.phase === 'AWAITING_SIDESHOW_RESPONSE') {
    return { type: 'SIDESHOW_RESPOND', playerId: r.pendingSideShow!.targetId, accept: rng() < 0.5 };
  }
  const blind = r.players.filter((p) => !p.packed && !p.seen);
  if (blind.length > 0 && rng() < 0.15) return { type: 'SEE', playerId: pick(rng, blind).id };
  if (rng() < 0.03) return { type: 'UNDO' };

  const id = r.turnId!;
  const legal = legalActions(t, id);
  const options: TableAction[] = [{ type: 'PACK', playerId: id }];
  if (legal.bet) {
    const { min, max, step } = legal.bet;
    const steps = Math.floor((max - min) / step);
    const amount = min + step * Math.floor(rng() * (steps + 1));
    options.push(...Array<TableAction>(5).fill({ type: 'CHAAL', playerId: id, amount }));
  } else if (legal.canSee) {
    options.push({ type: 'SEE', playerId: id });
  }
  if (legal.show) options.push({ type: 'SHOW', playerId: id });
  if (legal.sideShow) options.push({ type: 'SIDESHOW_REQUEST', playerId: id });
  return pick(rng, options);
}

function randomSettings(rng: () => number): Partial<Settings> {
  const buyIn = rng() < 0.5;
  return {
    chipMode: buyIn ? 'buyIn' : 'openTab',
    startingChips: buyIn ? 200 : 0,
    maxChaal: pick(rng, [40, 160, null]),
    potLimit: pick(rng, [150, 1000, null]),
    maxBlinds: pick(rng, [1, 2, 4, null]),
    blindCanShow: rng() < 0.7,
    a23Rank: rng() < 0.5 ? 'second' : 'lowest',
  };
}

describe('random games (simulation)', () => {
  it('300 random games: chips are conserved, rounds always end, replay matches, nets settle to zero', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = mulberry32(seed);
      const random = (n: number) => Math.floor(rng() * n);
      const ids = Array.from({ length: 2 + random(6) }, (_, i) => `p${i}`);
      let t = makeTable(ids, randomSettings(rng));

      for (let roundNo = 0; roundNo < 6; roundNo++) {
        if (!planNextRound(t)) {
          for (const p of t.players) {
            if (p.balance < t.settings.boot)
              t = ok(applyAction(t, { type: 'REBUY', playerId: p.id })).state;
          }
        }
        t = ok(applyAction(t, { type: 'START_ROUND', deck: shuffle(createDeck(), random) })).state;
        checkInvariants(t);

        let steps = 0;
        while (isRoundInProgress(t)) {
          if (++steps > 3000) throw new Error(`seed ${seed}: round did not finish`);
          const move = randomMove(t, rng);
          const res = applyAction(t, move);
          if (!res.ok) {
            // Only UNDO may legitimately fail here; every other move was chosen from legal ones.
            if (move.type !== 'UNDO')
              throw new Error(`seed ${seed}: ${move.type} rejected: ${res.error.message}`);
            continue;
          }
          t = res.state;
          checkInvariants(t);
        }
        expect(replayRound(t.roundInitial!, t.round!.actions)).toEqual(t.round);
      }

      const nets = computeNets(t.players);
      expect(nets.reduce((s, n) => s + n.net, 0)).toBe(0);
      expect(() => settle(nets)).not.toThrow();
    }
  });
});
