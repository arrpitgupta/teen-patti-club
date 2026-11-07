import { describe, expect, it } from 'vitest';
import { computeNets } from '../../settlement/settlement';
import { legalActions } from './legal';
import { applyAction, planNextRound } from './table';
import {
  act,
  balances,
  expectError,
  makeTable,
  packUntilOver,
  round,
  rp,
  startAny,
} from './testUtils';

const BUY_IN = { chipMode: 'buyIn', startingChips: 100 } as const;
const sumNets = (t: Parameters<typeof computeNets>[0]) =>
  computeNets(t).reduce((s, n) => s + n.net, 0);

describe('buy-in chip mode', () => {
  it('every player starts with the buy-in', () => {
    const t = makeTable(['a', 'b'], BUY_IN);
    expect(t.players.map((p) => [p.balance, p.totalBuyIn])).toEqual([
      [100, 100],
      [100, 100],
    ]);
  });

  it('a player cannot bet more chips than they have', () => {
    let t = makeTable(['a', 'b', 'c'], BUY_IN);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 75, reason: 'test' }); // b: 25
    t = startAny(t); // b pays boot: 15 left
    expect(legalActions(t, 'b').bet).toEqual({ min: 10, max: 15, step: 1 });
  });

  it('a seen player’s maximum is rounded down to an even number', () => {
    let t = makeTable(['a', 'b', 'c'], BUY_IN);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 55, reason: 'test' }); // b: 45
    t = act(startAny(t), { type: 'SEE', playerId: 'b' }); // b: 35
    expect(legalActions(t, 'b').bet).toEqual({ min: 20, max: 34, step: 2 });
  });

  it('a player who cannot afford the minimum can only pack (no bet, show or side show)', () => {
    let t = makeTable(['a', 'b', 'c'], BUY_IN);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 75, reason: 'test' });
    t = act(startAny(t), { type: 'SEE', playerId: 'b' }); // b: 15, seen min is 20
    const legal = legalActions(t, 'b');
    expect(legal.bet).toBeNull();
    expect(legal.betBlocked).toBe('INSUFFICIENT_CHIPS');
    expect(legal.show).toBeNull();
    expect(legal.sideShow).toBeNull();
    expect(legal.canPack).toBe(true);
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'b', amount: 20 }), 'INSUFFICIENT_CHIPS');
  });

  it('a player who cannot pay the boot sits out the next round', () => {
    let t = makeTable(['a', 'b', 'c'], BUY_IN);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 95, reason: 'test' }); // b: 5
    expect(planNextRound(t)!.order).toEqual(['c', 'a']);
    t = startAny(t);
    expect(round(t).players.map((p) => p.id)).toEqual(['a', 'c']);
    expect(balances(t).b).toBe(5);
  });

  it('a round needs at least 2 players who can pay the boot', () => {
    let t = makeTable(['a', 'b'], BUY_IN);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 95, reason: 'test' });
    expectError(applyAction(t, { type: 'START_ROUND', deck: [] }), 'NOT_ENOUGH_PLAYERS');
  });

  it('the host can re-buy a player between rounds; it is recorded and counts as bought in', () => {
    let t = makeTable(['a', 'b'], BUY_IN);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 95, reason: 'test' });
    t = act(t, { type: 'REBUY', playerId: 'b' });
    expect(t.players.find((p) => p.id === 'b')).toMatchObject({ balance: 105, totalBuyIn: 200 });
    expect(t.corrections.at(-1)).toEqual({ type: 'REBUY', playerId: 'b', amount: 100 });
    expect(sumNets(t.players)).toBe(0);
  });

  it('re-buy is not allowed during a round or in open-tab games', () => {
    expectError(
      applyAction(startAny(makeTable(['a', 'b'], BUY_IN)), { type: 'REBUY', playerId: 'b' }),
      'ROUND_IN_PROGRESS',
    );
    expectError(
      applyAction(makeTable(['a', 'b']), { type: 'REBUY', playerId: 'b' }),
      'ILLEGAL_ACTION',
    );
  });

  it('net for settlement = balance - (buy-in + re-buys), and nets sum to zero', () => {
    let t = makeTable(['a', 'b', 'c'], BUY_IN);
    t = packUntilOver(startAny(t));
    t = act(t, { type: 'ADJUST', from: 'c', to: 'b', amount: 90, reason: 'test' });
    t = act(t, { type: 'REBUY', playerId: 'c' });
    expect(sumNets(t.players)).toBe(0);
  });
});

describe('open tab chip mode', () => {
  it('starts at 0 and always lets players pay', () => {
    let t = makeTable(['a', 'b', 'c']);
    expect(t.players.map((p) => p.balance)).toEqual([0, 0, 0]);
    t = act(t, { type: 'ADJUST', from: 'b', to: 'a', amount: 5000, reason: 'test' });
    t = act(startAny(t), { type: 'SEE', playerId: 'b' });
    expect(rp(t, 'b').balance).toBe(-5010);
    expect(legalActions(t, 'b').bet).toEqual({ min: 20, max: 40, step: 2 });
  });
});

describe('host chip adjustments', () => {
  it('are transfers between players with a required reason, recorded for everyone', () => {
    const t = act(makeTable(['a', 'b']), {
      type: 'ADJUST',
      from: 'a',
      to: 'b',
      amount: 50,
      reason: 'miscount',
    });
    expect(balances(t)).toEqual({ a: -50, b: 50 });
    expect(t.corrections).toEqual([
      { type: 'ADJUST', roundNumber: null, from: 'a', to: 'b', amount: 50, reason: 'miscount' },
    ]);
  });

  it('reject a missing reason, a non-positive amount, or the same player twice', () => {
    const t = makeTable(['a', 'b']);
    const bad = [
      { from: 'a', to: 'b', amount: 50, reason: ' ' },
      { from: 'a', to: 'b', amount: 0, reason: 'x' },
      { from: 'a', to: 'b', amount: 1.5, reason: 'x' },
      { from: 'a', to: 'a', amount: 5, reason: 'x' },
      { from: 'a', to: 'zz', amount: 5, reason: 'x' },
    ];
    for (const b of bad)
      expectError(applyAction(t, { type: 'ADJUST', ...b }), 'INVALID_ADJUSTMENT');
  });

  it('cannot use the pot between rounds', () => {
    expectError(
      applyAction(makeTable(['a', 'b']), {
        type: 'ADJUST',
        from: 'pot',
        to: 'a',
        amount: 5,
        reason: 'x',
      }),
      'INVALID_ADJUSTMENT',
    );
  });

  it('during a round, can move chips between a player and the pot', () => {
    let t = startAny(makeTable(['a', 'b', 'c']));
    t = act(t, { type: 'ADJUST', from: 'pot', to: 'a', amount: 10, reason: 'boot paid twice' });
    expect(round(t).pot).toBe(20);
    expect(rp(t, 'a').balance).toBe(0);
    expect(balances(t).a).toBe(0);
  });

  it('cannot take a buy-in player below zero', () => {
    expectError(
      applyAction(makeTable(['a', 'b'], BUY_IN), {
        type: 'ADJUST',
        from: 'a',
        to: 'b',
        amount: 101,
        reason: 'x',
      }),
      'INSUFFICIENT_CHIPS',
    );
  });
});
