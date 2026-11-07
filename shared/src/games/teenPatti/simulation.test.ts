import { describe, expect, it } from 'vitest';
import { createDeck, shuffle, type Card } from '../../cards/cards';
import { computeNets, settle } from '../../settlement/settlement';
import { legalActions } from './legal';
import { replayRound } from './round';
import type { Settings } from './settings';
import { applyAction, isRoundInProgress, planNextRound } from './table';
import { makeTable, ok } from './testUtils';
import type { TableAction, TableState } from './types';
import { publicView, tableFromPublic } from './views';

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
  // The client computes legal moves from the public view; it must match the server exactly.
  const fromPublic = tableFromPublic(publicView(t));
  for (const p of t.players) {
    expect(legalActions(fromPublic, p.id)).toEqual(legalActions(t, p.id));
  }
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

/** Physical mode: comparisons are decided by the players (any legal answer). */
function randomPhysicalMove(
  t: TableState,
  rng: () => number,
  dealt: Record<string, Card[]>,
): TableAction {
  const r = t.round!;
  if (r.phase === 'DEALING') return { type: 'CARDS_DEALT' };
  const c = r.comparison;
  if (r.phase === 'AWAITING_RESULT' && c) {
    const id = pick(rng, c.playerIds);
    const legal = legalActions(t, id).result!;
    if (legal.canEnterCards) {
      const todo = c.playerIds.filter((p) => !c.enteredCards[p]);
      const who = pick(rng, todo);
      return { type: 'RESULT_ENTER_CARDS', playerId: who, cards: dealt[who]! };
    }
    if (legal.canPickWinner) {
      return { type: 'RESULT_TAP_WINNER', playerId: id, winnerIds: [pick(rng, c.playerIds)] };
    }
    const waiting = c.playerIds.filter((p) => !c.proposal?.confirmedBy.includes(p));
    const who = pick(rng, waiting);
    return rng() < 0.85
      ? { type: 'RESULT_CONFIRM', playerId: who }
      : { type: 'RESULT_DISPUTE', playerId: who };
  }
  // Players sometimes enter their (real) hand; now and then with a typo that clashes.
  const canEnter = r.players.filter((p) => legalActions(t, p.id).canEnterHand);
  if (canEnter.length > 0 && rng() < 0.12) {
    const p = pick(rng, canEnter);
    const other = pick(rng, Object.values(dealt));
    const cards: Card[] = rng() < 0.1 ? [other[0]!, ...dealt[p.id]!.slice(1)] : dealt[p.id]!;
    return new Set(cards).size === 3
      ? { type: 'ENTER_HAND', playerId: p.id, cards }
      : { type: 'ENTER_HAND', playerId: p.id, cards: dealt[p.id]! };
  }
  return randomMove(t, rng);
}

describe('random games (simulation)', () => {
  it('150 random physical games with entered hands: no card is public before the round ends', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = mulberry32(seed * 7919);
      const random = (n: number) => Math.floor(rng() * n);
      const ids = Array.from({ length: 2 + random(5) }, (_, i) => `p${i}`);
      let t = makeTable(ids, {
        ...randomSettings(rng),
        mode: 'physical',
        physicalResolution: pick(rng, ['hybrid', 'tapWinner', 'enterCards'] as const),
      });
      for (let roundNo = 0; roundNo < 5; roundNo++) {
        if (!planNextRound(t)) {
          for (const p of t.players) {
            if (p.balance < t.settings.boot)
              t = ok(applyAction(t, { type: 'REBUY', playerId: p.id })).state;
          }
        }
        t = ok(applyAction(t, { type: 'START_ROUND' })).state;
        // The "real" cards on the table.
        const deck = shuffle(createDeck(), random);
        const dealt = Object.fromEntries(ids.map((id, i) => [id, deck.slice(i * 3, i * 3 + 3)]));
        let steps = 0;
        while (isRoundInProgress(t)) {
          if (++steps > 3000) throw new Error(`seed ${seed}: physical round did not finish`);
          const move = randomPhysicalMove(t, rng, dealt);
          const res = applyAction(t, move);
          if (!res.ok) {
            if (move.type !== 'UNDO' && move.type !== 'RESULT_ENTER_CARDS')
              throw new Error(`seed ${seed}: ${move.type} rejected: ${res.error.message}`);
            continue;
          }
          t = res.state;
          checkInvariants(t);
          if (isRoundInProgress(t)) {
            const pub = JSON.stringify(publicView(t));
            for (const card of deck.slice(0, ids.length * 3))
              expect(pub).not.toContain(`"${card}"`);
          }
        }
        expect(replayRound(t.roundInitial!, t.round!.actions)).toEqual(t.round);
      }
      expect(computeNets(t.players).reduce((s, n) => s + n.net, 0)).toBe(0);
    }
  });

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
