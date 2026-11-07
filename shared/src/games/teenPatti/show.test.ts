import { describe, expect, it } from 'vitest';
import { legalActions } from './legal';
import { applyAction } from './table';
import { act, balances, expectError, makeTable, round, startWith } from './testUtils';

// Two players: a (seat 0, dealer) and b (seat 1, acts first).
const STRONG = 'As Ad Ac';
const WEAK = '2s 3d 5c';

describe('show', () => {
  it('is possible on the first turn when only 2 players are in; a blind requester pays the stake', () => {
    const t = startWith(makeTable(['a', 'b']), { a: WEAK, b: STRONG });
    expect(legalActions(t, 'b').show).toEqual({ cost: 10, opponentId: 'a' });
  });

  it('is not possible with 3 or more players still in', () => {
    const t = startWith(makeTable(['a', 'b', 'c']), { a: WEAK, b: STRONG, c: '9h Th 2d' });
    expect(legalActions(t, 'b').show).toBeNull();
    expectError(applyAction(t, { type: 'SHOW', playerId: 'b' }), 'ILLEGAL_ACTION');
  });

  it('the higher hand wins the pot and both hands are revealed to everyone', () => {
    const t = act(startWith(makeTable(['a', 'b']), { a: WEAK, b: STRONG }), {
      type: 'SHOW',
      playerId: 'b',
    });
    const r = round(t);
    expect(r.phase).toBe('ENDED');
    expect(r.result).toMatchObject({
      reason: 'show',
      winnerIds: ['b'],
      pot: 30,
      resolution: 'auto',
      winningHand: 'Trail of Aces',
      explanation: 'Trail ranks above High card',
    });
    expect(r.result!.revealedHands).toEqual({ a: ['2s', '3d', '5c'], b: ['As', 'Ad', 'Ac'] });
    expect(balances(t)).toEqual({ a: -10, b: 10 });
  });

  it('the requester can lose', () => {
    const t = act(startWith(makeTable(['a', 'b']), { a: STRONG, b: WEAK }), {
      type: 'SHOW',
      playerId: 'b',
    });
    expect(round(t).result!.winnerIds).toEqual(['a']);
  });

  it('on an exact tie, the player who did NOT ask for the show wins', () => {
    const t = act(startWith(makeTable(['a', 'b']), { a: 'Ah Kd 9c', b: 'As Kc 9d' }), {
      type: 'SHOW',
      playerId: 'b',
    });
    expect(round(t).result!.winnerIds).toEqual(['a']);
    expect(round(t).result!.explanation).toBe(
      'the hands are equal, and on a tie the player who did not ask for the show wins',
    );
  });

  it('a seen requester pays 2x the stake', () => {
    const t = act(
      startWith(makeTable(['a', 'b']), { a: WEAK, b: STRONG }),
      { type: 'SEE', playerId: 'a' },
      { type: 'SEE', playerId: 'b' },
    );
    expect(legalActions(t, 'b').show).toEqual({ cost: 20, opponentId: 'a' });
    expect(round(act(t, { type: 'SHOW', playerId: 'b' })).result!.pot).toBe(40);
  });

  it('a seen player cannot ask for a show against a blind player', () => {
    const t = act(startWith(makeTable(['a', 'b']), { a: WEAK, b: STRONG }), {
      type: 'SEE',
      playerId: 'b',
    });
    expect(legalActions(t, 'b').show).toBeNull();
    expectError(applyAction(t, { type: 'SHOW', playerId: 'b' }), 'ILLEGAL_ACTION');
  });

  it('a blind player can ask for a show against a seen player', () => {
    const t = act(startWith(makeTable(['a', 'b']), { a: WEAK, b: STRONG }), {
      type: 'SEE',
      playerId: 'a',
    });
    expect(legalActions(t, 'b').show).toEqual({ cost: 10, opponentId: 'a' });
  });

  it('when "blind may request show" is off, blind players cannot ask', () => {
    let t = startWith(makeTable(['a', 'b'], { blindCanShow: false }), { a: WEAK, b: STRONG });
    expect(legalActions(t, 'b').show).toBeNull();
    t = act(t, { type: 'SEE', playerId: 'a' }, { type: 'SEE', playerId: 'b' });
    expect(legalActions(t, 'b').show).toEqual({ cost: 20, opponentId: 'a' });
  });

  it('after reaching max blinds, a player must see before asking for a show', () => {
    const t = act(
      startWith(makeTable(['a', 'b'], { maxBlinds: 1 }), { a: WEAK, b: STRONG }),
      { type: 'CHAAL', playerId: 'b', amount: 10 },
      { type: 'CHAAL', playerId: 'a', amount: 10 },
    );
    expect(legalActions(t, 'b').show).toBeNull();
    expectError(applyAction(t, { type: 'SHOW', playerId: 'b' }), 'MUST_SEE');
  });
});
