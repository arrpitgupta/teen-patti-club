import { describe, expect, it } from 'vitest';
import { legalActions } from './legal';
import { applyAction } from './table';
import { act, expectError, makeTable, round, rp } from './testUtils';
import type { Settings } from './settings';
import type { TableState } from './types';

function physical(ids: string[], overrides: Partial<Settings> = {}): TableState {
  return act(makeTable(ids, { mode: 'physical', ...overrides }), { type: 'START_ROUND' });
}

/** Two players (a dealer, b first), cards dealt, b asks for a show. */
function showPending(overrides: Partial<Settings> = {}): TableState {
  return act(
    physical(['a', 'b'], overrides),
    { type: 'CARDS_DEALT' },
    { type: 'SHOW', playerId: 'b' },
  );
}

describe('physical mode: dealing', () => {
  it('no cards are stored; betting waits until the host taps "Cards dealt"', () => {
    let t = physical(['a', 'b', 'c']);
    expect(round(t).phase).toBe('DEALING');
    expect(round(t).players.every((p) => p.hand === null)).toBe(true);
    expect(round(t).pot).toBe(30);
    expectError(applyAction(t, { type: 'CHAAL', playerId: 'b', amount: 10 }), 'NOT_DEALT');
    t = act(t, { type: 'CARDS_DEALT' });
    expect(round(t).phase).toBe('BETTING');
    expect(round(t).turnId).toBe('b');
  });

  it('"I’ve looked at my cards" makes a player seen', () => {
    const t = act(physical(['a', 'b']), { type: 'CARDS_DEALT' }, { type: 'SEE', playerId: 'a' });
    expect(rp(t, 'a').seen).toBe(true);
  });
});

describe('physical mode: tap winner (hybrid is the default)', () => {
  it('a show waits for the players to say who won', () => {
    const t = showPending();
    expect(round(t).phase).toBe('AWAITING_RESULT');
    expect(round(t).comparison).toMatchObject({
      reason: 'show',
      playerIds: ['b', 'a'],
      method: 'tapWinner',
    });
    expect(legalActions(t, 'a').result).toMatchObject({ canPickWinner: true, canDispute: true });
  });

  it('one player picks the winner, the other confirms, the winner gets the pot', () => {
    let t = act(showPending(), { type: 'RESULT_TAP_WINNER', playerId: 'a', winnerIds: ['a'] });
    expect(round(t).phase).toBe('AWAITING_RESULT');
    expect(legalActions(t, 'b').result).toMatchObject({ canConfirm: true });
    t = act(t, { type: 'RESULT_CONFIRM', playerId: 'b' });
    expect(round(t).result).toMatchObject({
      reason: 'show',
      winnerIds: ['a'],
      resolution: 'tapWinner',
      revealedHands: {},
    });
  });

  it('picking both players means a tie (here the player who did not ask wins)', () => {
    const t = act(
      showPending(),
      { type: 'RESULT_TAP_WINNER', playerId: 'b', winnerIds: ['a', 'b'] },
      { type: 'RESULT_CONFIRM', playerId: 'a' },
    );
    expect(round(t).result!.winnerIds).toEqual(['a']);
  });

  it('only players in the show can pick or confirm', () => {
    let t = act(
      physical(['a', 'b', 'c']),
      { type: 'CARDS_DEALT' },
      { type: 'PACK', playerId: 'b' },
    );
    t = act(t, { type: 'SHOW', playerId: 'c' });
    expectError(
      applyAction(t, { type: 'RESULT_TAP_WINNER', playerId: 'b', winnerIds: ['c'] }),
      'ILLEGAL_ACTION',
    );
  });

  it('a dispute switches to entering cards; the evaluator decides and explains', () => {
    let t = act(
      showPending(),
      { type: 'RESULT_TAP_WINNER', playerId: 'b', winnerIds: ['b'] },
      { type: 'RESULT_DISPUTE', playerId: 'a' },
    );
    expect(round(t).comparison!.method).toBe('enterCards');
    t = act(t, { type: 'RESULT_ENTER_CARDS', playerId: 'b', cards: ['2s', '3d', '5c'] });
    expect(round(t).phase).toBe('AWAITING_RESULT');
    t = act(t, { type: 'RESULT_ENTER_CARDS', playerId: 'a', cards: ['Kh', 'Kd', '2c'] });
    expect(round(t).result).toMatchObject({
      winnerIds: ['a'],
      resolution: 'enterCards',
      winningHand: 'Pair of Kings',
      explanation: 'Pair ranks above High card',
      revealedHands: { a: ['Kh', 'Kd', '2c'], b: ['2s', '3d', '5c'] },
    });
  });

  it('entered cards must be 3 different cards not already picked by someone else', () => {
    const t = act(showPending({ physicalResolution: 'enterCards' }), {
      type: 'RESULT_ENTER_CARDS',
      playerId: 'b',
      cards: ['2s', '3d', '5c'],
    });
    for (const cards of [
      ['Kh', 'Kd'],
      ['Kh', 'Kh', '2c'],
      ['Kh', 'Kd', '2s'],
    ]) {
      expectError(
        applyAction(t, { type: 'RESULT_ENTER_CARDS', playerId: 'a', cards: cards as never }),
        'INVALID_CARDS',
      );
    }
  });

  it('with "Enter cards" as the method, the show goes straight to entering cards', () => {
    expect(round(showPending({ physicalResolution: 'enterCards' })).comparison!.method).toBe(
      'enterCards',
    );
  });
});

describe('physical mode: side show and pot limit', () => {
  it('side show: after accept, the two players settle it, then betting continues', () => {
    let t = act(
      physical(['a', 'b', 'c', 'd']),
      { type: 'CARDS_DEALT' },
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'SEE', playerId: 'c' },
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
    );
    expect(round(t).phase).toBe('AWAITING_RESULT');
    t = act(
      t,
      { type: 'RESULT_TAP_WINNER', playerId: 'c', winnerIds: ['b'] },
      { type: 'RESULT_CONFIRM', playerId: 'b' },
    );
    expect(rp(t, 'c').packed).toBe(true);
    expect(round(t).phase).toBe('BETTING');
    expect(round(t).turnId).toBe('d');
  });

  it('pot-limit show with 3 players: everyone involved must confirm', () => {
    let t = act(
      physical(['a', 'b', 'c'], { potLimit: 60 }),
      { type: 'CARDS_DEALT' },
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'CHAAL', playerId: 'c', amount: 20 },
    );
    expect(round(t).comparison).toMatchObject({ reason: 'potLimit', playerIds: ['b', 'c', 'a'] });
    t = act(
      t,
      { type: 'RESULT_TAP_WINNER', playerId: 'a', winnerIds: ['c'] },
      { type: 'RESULT_CONFIRM', playerId: 'b' },
    );
    expect(round(t).phase).toBe('AWAITING_RESULT');
    t = act(t, { type: 'RESULT_CONFIRM', playerId: 'c' });
    expect(round(t).result).toMatchObject({ reason: 'potLimit', winnerIds: ['c'], pot: 70 });
  });
});
