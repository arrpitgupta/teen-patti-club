import { describe, expect, it } from 'vitest';
import { legalActions } from './legal';
import { applyAction } from './table';
import { act, expectError, makeTable, round, rp, startWith } from './testUtils';
import type { TableState } from './types';
import { privateView, publicView } from './views';

// Seats a=0 (dealer), b=1, c=2, d=3. Turn order: b, c, d, a.
const HANDS = {
  a: '2s 4d 7c',
  b: 'Ah Kd 9c', // high card A-K-9
  c: '5s 5h 5d', // trail
  d: '3s 8d Jc',
};

/** b sees and bets, c sees: c may now ask b for a side show. */
function setup(hands: Record<string, string> = HANDS): TableState {
  let t = startWith(makeTable(['a', 'b', 'c', 'd']), hands);
  t = act(
    t,
    { type: 'SEE', playerId: 'b' },
    { type: 'CHAAL', playerId: 'b', amount: 20 },
    { type: 'SEE', playerId: 'c' },
  );
  return t;
}

describe('side show eligibility', () => {
  it('a seen player can ask the previous seen player; it costs a normal seen bet (2x stake)', () => {
    expect(legalActions(setup(), 'c').sideShow).toEqual({ cost: 20, targetId: 'b' });
  });

  it('the requester must be seen', () => {
    let t = startWith(makeTable(['a', 'b', 'c', 'd']), HANDS);
    t = act(t, { type: 'SEE', playerId: 'b' }, { type: 'CHAAL', playerId: 'b', amount: 20 });
    expect(legalActions(t, 'c').sideShow).toBeNull();
    expectError(applyAction(t, { type: 'SIDESHOW_REQUEST', playerId: 'c' }), 'ILLEGAL_ACTION');
  });

  it('the previous player must be seen', () => {
    let t = startWith(makeTable(['a', 'b', 'c', 'd']), HANDS);
    t = act(t, { type: 'CHAAL', playerId: 'b', amount: 10 }, { type: 'SEE', playerId: 'c' });
    expect(legalActions(t, 'c').sideShow).toBeNull();
  });

  it('the previous player is the nearest one still in, counter-clockwise (packed players skipped)', () => {
    let t = startWith(makeTable(['a', 'b', 'c', 'd']), HANDS);
    t = act(
      t,
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'PACK', playerId: 'c' },
      { type: 'SEE', playerId: 'd' },
    );
    expect(legalActions(t, 'd').sideShow).toEqual({ cost: 20, targetId: 'b' });
  });

  it('needs at least 3 players still in', () => {
    let t = startWith(makeTable(['a', 'b', 'c']), { a: HANDS.a, b: HANDS.b, c: HANDS.c });
    t = act(
      t,
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'PACK', playerId: 'c' },
      { type: 'SEE', playerId: 'a' },
    );
    expect(legalActions(t, 'a').sideShow).toBeNull();
    expect(legalActions(t, 'a').show).not.toBeNull();
  });
});

describe('side show flow', () => {
  it('requesting pays the bet (stake unchanged) and waits for the other player', () => {
    const t = act(setup(), { type: 'SIDESHOW_REQUEST', playerId: 'c' });
    const r = round(t);
    expect(r.phase).toBe('AWAITING_SIDESHOW_RESPONSE');
    expect(r.pendingSideShow).toEqual({ requesterId: 'c', targetId: 'b' });
    expect(r.pot).toBe(80);
    expect(r.stake).toBe(10);
    expect(legalActions(t, 'b').canRespondSideShow).toBe(true);
  });

  it('only the asked player can answer, and nobody can bet meanwhile', () => {
    const t = act(setup(), { type: 'SIDESHOW_REQUEST', playerId: 'c' });
    expectError(
      applyAction(t, { type: 'SIDESHOW_RESPOND', playerId: 'd', accept: true }),
      'NOT_YOUR_TURN',
    );
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'd', amount: 10 }), 'ILLEGAL_ACTION');
  });

  it('deny: play continues with the player after the requester; the bet stays in the pot', () => {
    const t = act(
      setup(),
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: false },
    );
    expect(round(t).phase).toBe('BETTING');
    expect(round(t).turnId).toBe('d');
    expect(round(t).pot).toBe(80);
    expect(rp(t, 'b').packed).toBe(false);
    expect(rp(t, 'c').packed).toBe(false);
  });

  it('a timeout counts as deny', () => {
    const t = act(
      setup(),
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'TIMEOUT', playerId: 'b' },
    );
    expect(round(t).turnId).toBe('d');
    expect(rp(t, 'b').packed).toBe(false);
  });

  it('accept, requester has the better hand: the other player packs', () => {
    const t = act(
      setup(),
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
    );
    expect(rp(t, 'b').packed).toBe(true);
    expect(rp(t, 'c').packed).toBe(false);
    expect(round(t).phase).toBe('BETTING');
    expect(round(t).turnId).toBe('d');
  });

  it('accept, requester has the worse hand: the requester packs', () => {
    const t = act(
      setup({ ...HANDS, b: '5s 5h 5d', c: 'Ah Kd 9c' }),
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
    );
    expect(rp(t, 'c').packed).toBe(true);
    expect(rp(t, 'b').packed).toBe(false);
    expect(round(t).turnId).toBe('d');
  });

  it('accept, exact tie: the requester packs', () => {
    const t = act(
      setup({ ...HANDS, b: 'Ah Kd 9c', c: 'As Kc 9d' }),
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
    );
    expect(rp(t, 'c').packed).toBe(true);
    expect(rp(t, 'b').packed).toBe(false);
  });

  it('only the two players see each other’s cards', () => {
    const t = act(
      setup(),
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
    );
    expect(privateView(t, 'c').visibleHands).toEqual({ b: ['Ah', 'Kd', '9c'] });
    expect(privateView(t, 'b').visibleHands).toEqual({ c: ['5s', '5h', '5d'] });
    expect(privateView(t, 'd').visibleHands).toEqual({});
    expect(JSON.stringify(publicView(t))).not.toContain('"Ah"');
  });
});
