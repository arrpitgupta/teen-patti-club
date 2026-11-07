import { describe, expect, it } from 'vitest';
import { legalActions } from './legal';
import { applyAction } from './table';
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

// Seats: a=0, b=1, c=2, d=3. First dealer is a, so b acts first.

describe('round start', () => {
  it('collects the boot from every player, everyone starts blind, stake = boot', () => {
    const t = startAny(makeTable(['a', 'b', 'c']));
    const r = round(t);
    expect(r.pot).toBe(30);
    expect(r.stake).toBe(10);
    expect(r.players.map((p) => p.balance)).toEqual([-10, -10, -10]);
    expect(r.players.every((p) => !p.seen && !p.packed)).toBe(true);
    expect(balances(t)).toEqual({ a: -10, b: -10, c: -10 }); // balances update live
  });

  it('the first player to join deals first; the player on their left acts first', () => {
    const t = startAny(makeTable(['a', 'b', 'c', 'd']));
    expect(round(t).dealerSeat).toBe(0);
    expect(round(t).turnId).toBe('b');
  });

  it('digital mode deals 3 different cards to each player', () => {
    const t = startAny(makeTable(['a', 'b', 'c', 'd']));
    const cards = round(t).players.flatMap((p) => p.hand ?? []);
    expect(cards).toHaveLength(12);
    expect(new Set(cards).size).toBe(12);
  });

  it('needs at least 2 players', () => {
    expectError(
      applyAction(makeTable(['a']), { type: 'START_ROUND', deck: [] }),
      'NOT_ENOUGH_PLAYERS',
    );
  });

  it('digital mode needs a full 52-card deck from the server', () => {
    expectError(applyAction(makeTable(['a', 'b']), { type: 'START_ROUND' }), 'INVALID_DECK');
  });

  it('cannot start a new round while one is being played', () => {
    const t = startAny(makeTable(['a', 'b']));
    expectError(applyAction(t, { type: 'START_ROUND' }), 'ROUND_IN_PROGRESS');
  });
});

describe('blind and seen bets', () => {
  it('a blind player can bet 1x to 2x the stake', () => {
    const t = startAny(makeTable(['a', 'b', 'c']));
    expect(legalActions(t, 'b').bet).toEqual({ min: 10, max: 20, step: 1 });
  });

  it('a blind bet makes the stake equal to the amount bet', () => {
    const t = act(startAny(makeTable(['a', 'b', 'c'])), {
      type: 'CHAAL',
      playerId: 'b',
      amount: 15,
    });
    expect(round(t).stake).toBe(15);
    expect(round(t).pot).toBe(45);
    expect(rp(t, 'b').balance).toBe(-25);
    expect(round(t).turnId).toBe('c');
  });

  it('a seen player bets 2x to 4x the stake, and the stake becomes half the bet', () => {
    let t = act(startAny(makeTable(['a', 'b', 'c'])), { type: 'SEE', playerId: 'b' });
    expect(legalActions(t, 'b').bet).toEqual({ min: 20, max: 40, step: 2 });
    t = act(t, { type: 'CHAAL', playerId: 'b', amount: 30 });
    expect(round(t).stake).toBe(15);
    expect(legalActions(t, 'c').bet).toEqual({ min: 15, max: 30, step: 1 });
  });

  it('rejects bets outside the range or not whole numbers', () => {
    const t = startAny(makeTable(['a', 'b', 'c']));
    for (const amount of [9, 21, 12.5, 0, -10]) {
      expectError(applyAction(t, { type: 'CHAAL', playerId: 'b', amount }), 'INVALID_AMOUNT');
    }
  });

  it('rejects odd seen bets (so the stake stays a whole number)', () => {
    const t = act(startAny(makeTable(['a', 'b', 'c'])), { type: 'SEE', playerId: 'b' });
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'b', amount: 25 }), 'INVALID_AMOUNT');
  });
});

describe('max chaal', () => {
  it('caps the stake: blind players pay at most the cap, seen players at most 2x the cap', () => {
    let t = startAny(makeTable(['a', 'b', 'c', 'd'], { maxChaal: 40 }));
    t = act(
      t,
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'CHAAL', playerId: 'c', amount: 40 },
    );
    expect(legalActions(t, 'd').bet).toEqual({ min: 40, max: 40, step: 1 });
    t = act(t, { type: 'SEE', playerId: 'd' });
    expect(legalActions(t, 'd').bet).toEqual({ min: 80, max: 80, step: 2 });
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'd', amount: 160 }), 'INVALID_AMOUNT');
  });

  it('with "no limit" there is no cap', () => {
    let t = startAny(makeTable(['a', 'b', 'c'], { maxChaal: null, potLimit: null }));
    t = act(
      t,
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'CHAAL', playerId: 'c', amount: 40 },
    );
    t = act(
      t,
      { type: 'CHAAL', playerId: 'a', amount: 80 },
      { type: 'CHAAL', playerId: 'b', amount: 160 },
    );
    expect(legalActions(t, 'c').bet).toEqual({ min: 160, max: 320, step: 1 });
  });
});

describe('max blinds', () => {
  it('after N blind bets a player must see before betting again (but may still pack)', () => {
    let t = startAny(makeTable(['a', 'b'], { maxBlinds: 2 }));
    t = act(
      t,
      { type: 'CHAAL', playerId: 'b', amount: 10 },
      { type: 'CHAAL', playerId: 'a', amount: 10 },
      { type: 'CHAAL', playerId: 'b', amount: 10 },
      { type: 'CHAAL', playerId: 'a', amount: 10 },
    );
    const legal = legalActions(t, 'b');
    expect(legal.mustSee).toBe(true);
    expect(legal.bet).toBeNull();
    expect(legal.betBlocked).toBe('MUST_SEE');
    expect(legal.canPack).toBe(true);
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'b', amount: 10 }), 'MUST_SEE');
    t = act(t, { type: 'SEE', playerId: 'b' });
    expect(legalActions(t, 'b').bet).toEqual({ min: 20, max: 40, step: 2 });
  });

  it('with "no limit" a player can stay blind forever', () => {
    let t = startAny(makeTable(['a', 'b'], { maxBlinds: null, potLimit: null }));
    for (let i = 0; i < 10; i++)
      t = act(t, { type: 'CHAAL', playerId: round(t).turnId!, amount: 10 });
    expect(legalActions(t, round(t).turnId!).bet).not.toBeNull();
  });
});

describe('seeing cards', () => {
  it('can be done any time, even when it is not your turn, and does not use your turn', () => {
    const t = act(startAny(makeTable(['a', 'b', 'c'])), { type: 'SEE', playerId: 'c' });
    expect(rp(t, 'c').seen).toBe(true);
    expect(round(t).turnId).toBe('b');
  });

  it('cannot be undone or repeated', () => {
    const t = act(startAny(makeTable(['a', 'b', 'c'])), { type: 'SEE', playerId: 'c' });
    expectError(applyAction(t, { type: 'SEE', playerId: 'c' }), 'ALREADY_SEEN');
  });
});

describe('turn order', () => {
  it('only the player whose turn it is can bet or pack', () => {
    const t = startAny(makeTable(['a', 'b', 'c']));
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'c', amount: 10 }), 'NOT_YOUR_TURN');
    expectError(applyAction(t, { type: 'PACK', playerId: 'c' }), 'NOT_YOUR_TURN');
  });

  it('goes clockwise and skips packed players', () => {
    let t = startAny(makeTable(['a', 'b', 'c', 'd']));
    t = act(
      t,
      { type: 'CHAAL', playerId: 'b', amount: 10 },
      { type: 'PACK', playerId: 'c' },
      { type: 'CHAAL', playerId: 'd', amount: 10 },
      { type: 'CHAAL', playerId: 'a', amount: 10 },
      { type: 'CHAAL', playerId: 'b', amount: 10 },
    );
    expect(round(t).turnId).toBe('d');
  });

  it('when everyone else packs, the last player wins the pot without showing cards', () => {
    let t = startAny(makeTable(['a', 'b', 'c']));
    t = act(t, { type: 'PACK', playerId: 'b' }, { type: 'PACK', playerId: 'c' });
    const r = round(t);
    expect(r.phase).toBe('ENDED');
    expect(r.result).toMatchObject({ reason: 'allPacked', winnerIds: ['a'], pot: 30 });
    expect(r.result!.revealedHands).toEqual({});
    expect(balances(t)).toEqual({ a: 20, b: -10, c: -10 });
  });

  it('a packed player loses what they put in', () => {
    let t = startAny(makeTable(['a', 'b', 'c']));
    t = act(t, { type: 'CHAAL', playerId: 'b', amount: 20 }, { type: 'PACK', playerId: 'c' });
    t = act(t, { type: 'PACK', playerId: 'a' });
    expect(balances(t)).toEqual({ a: -10, b: 20, c: -10 });
  });
});

describe('dealer rotation', () => {
  it('moves one seat clockwise each round', () => {
    let t = packUntilOver(startAny(makeTable(['a', 'b', 'c'])));
    t = startAny(t);
    expect(round(t).dealerSeat).toBe(1);
    expect(round(t).turnId).toBe('c');
    t = startAny(packUntilOver(t));
    expect(round(t).dealerSeat).toBe(2);
    expect(round(t).turnId).toBe('a');
    t = startAny(packUntilOver(t));
    expect(round(t).dealerSeat).toBe(0);
  });

  it('skips players who have left', () => {
    let t = packUntilOver(startAny(makeTable(['a', 'b', 'c'])));
    t = act(t, { type: 'REMOVE_PLAYER', playerId: 'b' });
    t = startAny(t);
    expect(round(t).dealerSeat).toBe(2);
    expect(round(t).players.map((p) => p.id)).toEqual(['a', 'c']);
    expect(round(t).turnId).toBe('a');
  });

  it('a player who left keeps their balance for settlement', () => {
    let t = startAny(makeTable(['a', 'b', 'c']));
    t = act(t, { type: 'PACK', playerId: 'b' }, { type: 'PACK', playerId: 'c' });
    t = act(t, { type: 'REMOVE_PLAYER', playerId: 'b' });
    expect(t.players.find((p) => p.id === 'b')).toMatchObject({ balance: -10, present: false });
  });

  it('players cannot leave in the middle of a round they are still playing', () => {
    const t = startAny(makeTable(['a', 'b', 'c']));
    expectError(applyAction(t, { type: 'REMOVE_PLAYER', playerId: 'c' }), 'ROUND_IN_PROGRESS');
  });
});

describe('open tab (default chip mode)', () => {
  it('balances can go negative without limit', () => {
    let t = startAny(makeTable(['a', 'b'], { maxChaal: null, potLimit: null, maxBlinds: null }));
    for (let i = 0; i < 12; i++) {
      const id = round(t).turnId!;
      t = act(t, { type: 'CHAAL', playerId: id, amount: legalActions(t, id).bet!.max });
    }
    expect(rp(t, 'a').balance).toBeLessThan(-10000);
    expect(legalActions(t, round(t).turnId!).bet).not.toBeNull();
  });
});
