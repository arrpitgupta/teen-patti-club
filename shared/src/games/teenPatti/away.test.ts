import { describe, expect, it } from 'vitest';
import { parseCards } from '../../cards/cards';
import { applyAction, planNextRound } from './table';
import {
  act,
  expectError,
  makeTable,
  ok,
  packUntilOver,
  round,
  startAny,
  startWith,
} from './testUtils';
import { publicView } from './views';

describe('Away (sit out upcoming rounds)', () => {
  it('an away player is skipped: no boot, balance kept, back from the next round', () => {
    let t = makeTable(['a', 'b', 'c'], { chipMode: 'buyIn', startingChips: 500 });
    t = act(t, { type: 'SET_AWAY', playerId: 'c', away: true });
    expect(t.players.find((p) => p.id === 'c')!.away).toBe(true);
    expect(planNextRound(t)!.order).not.toContain('c');

    t = packUntilOver(startAny(t));
    expect(round(t).players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(t.players.find((p) => p.id === 'c')!.balance).toBe(500);

    t = act(t, { type: 'SET_AWAY', playerId: 'c', away: false });
    t = startAny(t);
    expect(round(t).players.map((p) => p.id)).toContain('c');
  });

  it('going away mid-round does not affect the current round', () => {
    let t = startAny(makeTable(['a', 'b', 'c']));
    t = act(t, { type: 'SET_AWAY', playerId: 'b', away: true });
    expect(round(t).players.map((p) => p.id)).toContain('b');
    t = packUntilOver(t);
    expect(planNextRound(t)!.order).not.toContain('b');
  });

  it('a round needs 2 players who are not away', () => {
    const t = act(makeTable(['a', 'b']), { type: 'SET_AWAY', playerId: 'a', away: true });
    expect(planNextRound(t)).toBeNull();
    expectError(applyAction(t, { type: 'START_ROUND' }), 'NOT_ENOUGH_PLAYERS');
  });

  it('emits an event and is public', () => {
    const res = ok(
      applyAction(makeTable(['a', 'b']), { type: 'SET_AWAY', playerId: 'a', away: true }),
    );
    expect(res.events).toEqual([{ type: 'PLAYER_AWAY', playerId: 'a', away: true }]);
    expect(publicView(res.state).players.find((p) => p.id === 'a')!.away).toBe(true);
    expectError(
      applyAction(res.state, { type: 'SET_AWAY', playerId: 'zz', away: true }),
      'UNKNOWN_PLAYER',
    );
  });
});

describe('Show my cards (voluntary reveal after a round)', () => {
  it('digital: a player shows their dealt cards to everyone after the round', () => {
    let t = startWith(makeTable(['a', 'b', 'c']), { a: 'As Ad 2c', b: 'Ks Kd 3c', c: '7h 8h 9h' });
    expectError(applyAction(t, { type: 'SHOW_MY_CARDS', playerId: 'b' }), 'ILLEGAL_ACTION');
    t = packUntilOver(t);
    const res = ok(applyAction(t, { type: 'SHOW_MY_CARDS', playerId: 'b' }));
    expect(res.events).toEqual([
      { type: 'HAND_SHOWN', playerId: 'b', cards: parseCards('Ks Kd 3c') },
    ]);
    expect(publicView(res.state).round!.shownHands).toEqual({ b: parseCards('Ks Kd 3c') });
    // Only once, and only your own.
    expectError(applyAction(res.state, { type: 'SHOW_MY_CARDS', playerId: 'b' }), 'ILLEGAL_ACTION');
  });

  it('cards already revealed by a show cannot be "shown" again', () => {
    let t = startWith(makeTable(['a', 'b']), { a: 'As Ad 2c', b: 'Ks Kd 3c' });
    t = act(t, { type: 'SEE', playerId: 'a' }, { type: 'SEE', playerId: 'b' });
    t = act(t, { type: 'SHOW', playerId: 'b' });
    expect(round(t).phase).toBe('ENDED');
    expectError(applyAction(t, { type: 'SHOW_MY_CARDS', playerId: 'a' }), 'ILLEGAL_ACTION');
  });

  it('physical: shows the entered hand, or the cards the player picks to show', () => {
    let t = act(
      makeTable(['a', 'b', 'c'], { mode: 'physical' }),
      { type: 'START_ROUND' },
      {
        type: 'CARDS_DEALT',
      },
    );
    t = act(t, { type: 'ENTER_HAND', playerId: 'b', cards: parseCards('Qs Qd 4c') });
    t = packUntilOver(t);
    t = act(t, { type: 'SHOW_MY_CARDS', playerId: 'b', cards: parseCards('2s 2d 2c') });
    // The entered hand wins over anything typed now.
    expect(round(t).shownHands).toEqual({ b: parseCards('Qs Qd 4c') });
    t = act(t, { type: 'SHOW_MY_CARDS', playerId: 'c', cards: parseCards('9s 9d 5c') });
    expect(round(t).shownHands!.c).toEqual(parseCards('9s 9d 5c'));
    // Without an entered hand, physical needs the cards.
    expectError(applyAction(t, { type: 'SHOW_MY_CARDS', playerId: 'a' }), 'INVALID_CARDS');
  });

  it('nobody can show for a round they did not play, or after a cancelled round', () => {
    let t = act(makeTable(['a', 'b', 'c']), { type: 'SET_AWAY', playerId: 'c', away: true });
    t = packUntilOver(startAny(t));
    expectError(applyAction(t, { type: 'SHOW_MY_CARDS', playerId: 'c' }), 'UNKNOWN_PLAYER');
    const cancelled = act(startAny(act(t, { type: 'SET_AWAY', playerId: 'c', away: false })), {
      type: 'CANCEL_ROUND',
    });
    expectError(applyAction(cancelled, { type: 'SHOW_MY_CARDS', playerId: 'a' }), 'ILLEGAL_ACTION');
  });
});
