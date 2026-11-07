import { describe, expect, it } from 'vitest';
import { act, balances, makeTable, round, rp, startWith } from './testUtils';

// Three players: a (seat 0, dealer), b, c. Turn order: b, c, a.
const HANDS = { a: 'Kh Kd 2c', b: '2s 4d 7c', c: '9s 9d 9c' };

describe('pot limit', () => {
  it('the bet that reaches the limit is paid in full, then everyone still in shows automatically', () => {
    let t = startWith(makeTable(['a', 'b', 'c'], { potLimit: 100 }), HANDS);
    t = act(
      t,
      { type: 'CHAAL', playerId: 'b', amount: 20 }, // pot 50
      { type: 'CHAAL', playerId: 'c', amount: 40 }, // pot 90
      { type: 'CHAAL', playerId: 'a', amount: 40 }, // pot 130, over the limit
    );
    const r = round(t);
    expect(r.phase).toBe('ENDED');
    expect(r.result).toMatchObject({ reason: 'potLimit', winnerIds: ['c'], pot: 130 });
    expect(Object.keys(r.result!.revealedHands).sort()).toEqual(['a', 'b', 'c']);
    expect(balances(t)).toEqual({ a: -50, b: -30, c: 80 });
  });

  it('packed players are not part of the pot-limit show', () => {
    let t = startWith(makeTable(['a', 'b', 'c'], { potLimit: 60 }), HANDS);
    t = act(t, { type: 'PACK', playerId: 'b' }, { type: 'CHAAL', playerId: 'c', amount: 20 }); // pot 50
    t = act(t, { type: 'CHAAL', playerId: 'a', amount: 20 }); // pot 70
    expect(Object.keys(round(t).result!.revealedHands).sort()).toEqual(['a', 'c']);
  });

  it('tied best hands split the pot; the leftover chip goes to the first tied player left of the dealer', () => {
    let t = startWith(makeTable(['a', 'b', 'c'], { potLimit: 100 }), {
      a: '2s 4d 7c',
      b: 'As Kd 9c',
      c: 'Ad Kc 9h',
    });
    t = act(
      t,
      { type: 'CHAAL', playerId: 'b', amount: 11 }, // pot 41
      { type: 'CHAAL', playerId: 'c', amount: 22 }, // pot 63
      { type: 'CHAAL', playerId: 'a', amount: 44 }, // pot 107
    );
    const result = round(t).result!;
    expect(result.winnerIds).toEqual(['b', 'c']);
    expect(result.payouts).toEqual({ b: 54, c: 53 });
    expect(result.explanation).toBe('the best hands are equal, so the pot is split');
  });

  it('a side show request that pushes the pot over the limit turns into the pot-limit show', () => {
    let t = startWith(makeTable(['a', 'b', 'c'], { potLimit: 60 }), HANDS);
    t = act(
      t,
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 20 }, // pot 50
      { type: 'SEE', playerId: 'c' },
      { type: 'SIDESHOW_REQUEST', playerId: 'c' }, // pot 70
    );
    expect(round(t).result).toMatchObject({ reason: 'potLimit', winnerIds: ['c'] });
  });

  it('if the boots alone reach the limit, the show happens straight away', () => {
    const t = startWith(makeTable(['a', 'b', 'c'], { potLimit: 20 }), HANDS);
    expect(round(t).result).toMatchObject({ reason: 'potLimit', winnerIds: ['c'], pot: 30 });
  });

  it('with "no limit" the pot can grow forever', () => {
    let t = startWith(makeTable(['a', 'b', 'c'], { potLimit: null, maxChaal: null }), HANDS);
    for (let i = 0; i < 9; i++) {
      t = act(t, { type: 'CHAAL', playerId: round(t).turnId!, amount: round(t).stake * 2 });
    }
    expect(round(t).phase).toBe('BETTING');
    expect(round(t).pot).toBeGreaterThan(10240);
    expect(rp(t, 'a').packed).toBe(false);
  });
});
