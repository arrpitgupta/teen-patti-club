import { describe, expect, it } from 'vitest';
import { parseCards } from '../../cards/cards';
import { legalActions } from './legal';
import type { Settings } from './settings';
import { applyAction } from './table';
import { act, expectError, makeTable, ok, round, rp, startAny } from './testUtils';
import type { TableState } from './types';
import { privateView, publicView } from './views';

const cards = parseCards;

/** Physical table, cards dealt. Dealer is the first id; the second acts first. */
function dealt(ids: string[], overrides: Partial<Settings> = {}): TableState {
  return act(
    makeTable(ids, { mode: 'physical', ...overrides }),
    { type: 'START_ROUND' },
    {
      type: 'CARDS_DEALT',
    },
  );
}

const enter = (playerId: string, text: string) =>
  ({ type: 'ENTER_HAND', playerId, cards: cards(text) }) as const;

/** No card code may appear anywhere in what other players receive. */
function expectNoCards(json: unknown, text: string) {
  const s = JSON.stringify(json);
  for (const c of cards(text)) expect(s).not.toContain(`"${c}"`);
}

describe('physical mode: Enter my hand', () => {
  it('stores the hand privately and marks the player seen', () => {
    const t = act(dealt(['a', 'b', 'c']), enter('b', 'As Ad Kc'));
    expect(rp(t, 'b')).toMatchObject({ seen: true, entered: true, handLocked: false });
    expect(privateView(t, 'b').hand).toEqual(cards('As Ad Kc'));
    // Nobody else sees it, in any form.
    expectNoCards(publicView(t), 'As Ad Kc');
    expectNoCards(privateView(t, 'a'), 'As Ad Kc');
    expectNoCards(privateView(t, 'c'), 'As Ad Kc');
    expect(legalActions(t, 'b').canEnterHand).toBe(true);
  });

  it('does not check other players’ cards on entry (that would leak them)', () => {
    const t = act(dealt(['a', 'b', 'c']), enter('b', 'As Ad Kc'), enter('c', 'As 2d 3c'));
    expect(rp(t, 'c').entered).toBe(true);
    expectNoCards(privateView(t, 'c'), 'Ad Kc');
  });

  it('can be edited until the player’s first bet after entering', () => {
    let t = act(dealt(['a', 'b', 'c']), enter('b', 'As Ad Kc'), enter('b', 'As Ad Kh'));
    expect(privateView(t, 'b').hand).toEqual(cards('As Ad Kh'));
    t = act(t, { type: 'CHAAL', playerId: 'b', amount: 20 });
    expect(rp(t, 'b').handLocked).toBe(true);
    expect(legalActions(t, 'b').canEnterHand).toBe(false);
    expectError(applyAction(t, enter('b', 'As Ad Qh')), 'ILLEGAL_ACTION');
  });

  it('a bet made before entering does not lock the hand', () => {
    let t = act(dealt(['a', 'b', 'c']), { type: 'CHAAL', playerId: 'b', amount: 10 });
    t = act(t, enter('b', 'As Ad Kc'));
    expect(rp(t, 'b').handLocked).toBe(false);
  });

  it('is only for physical cards, after dealing, for players still in', () => {
    const digital = startAny(makeTable(['a', 'b']));
    expectError(applyAction(digital, enter('a', 'As Ad Kc')), 'ILLEGAL_ACTION');
    const dealing = act(makeTable(['a', 'b'], { mode: 'physical' }), { type: 'START_ROUND' });
    expectError(applyAction(dealing, enter('a', 'As Ad Kc')), 'NOT_DEALT');
    const packed = act(dealt(['a', 'b', 'c']), { type: 'PACK', playerId: 'b' });
    expectError(applyAction(packed, enter('b', 'As Ad Kc')), 'ILLEGAL_ACTION');
    expectError(applyAction(dealt(['a', 'b']), enter('b', 'As As Kc')), 'INVALID_CARDS');
  });
});

describe('physical mode: comparing entered hands', () => {
  it('show: the evaluator decides, both confirm, hands are revealed with the reason', () => {
    let t = act(dealt(['a', 'b']), enter('a', 'Ks Kd 2c'), enter('b', 'As Ad 3c'), {
      type: 'SHOW',
      playerId: 'b',
    });
    const c = round(t).comparison!;
    expect(c.method).toBe('entered');
    expect(c.proposal).toMatchObject({ winnerIds: ['b'], confirmedBy: [] });
    // The two players see each other's entered cards so they can check them.
    expect(privateView(t, 'a').visibleHands).toEqual({ b: cards('As Ad 3c') });
    expect(privateView(t, 'b').visibleHands).toEqual({ a: cards('Ks Kd 2c') });
    expect(legalActions(t, 'a').result).toMatchObject({ canConfirm: true, canDispute: true });

    t = act(t, { type: 'RESULT_CONFIRM', playerId: 'a' });
    expect(round(t).phase).toBe('AWAITING_RESULT');
    t = act(t, { type: 'RESULT_CONFIRM', playerId: 'b' });
    expect(round(t).result).toMatchObject({
      reason: 'show',
      winnerIds: ['b'],
      resolution: 'entered',
      winningHand: expect.stringContaining('Pair'),
      revealedHands: { a: cards('Ks Kd 2c'), b: cards('As Ad 3c') },
    });
    expect(round(t).result!.explanation).toBeTruthy();
  });

  it('side show: only the two players see the cards; the loser packs', () => {
    // a dealer; b, c, a in turn order. b and c seen; c asks b for a side show.
    let t = act(
      dealt(['a', 'b', 'c']),
      enter('b', '7s 8s 9s'),
      enter('c', 'Ah Kh 2c'),
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
    );
    expect(round(t).comparison!.method).toBe('entered');
    expectNoCards(privateView(t, 'a'), '7s 8s 9s Ah Kh 2c');
    expectNoCards(publicView(t), '7s 8s 9s Ah Kh 2c');
    t = act(
      t,
      { type: 'RESULT_CONFIRM', playerId: 'c' },
      { type: 'RESULT_CONFIRM', playerId: 'b' },
    );
    expect(rp(t, 'c').packed).toBe(true);
    expect(round(t).phase).toBe('BETTING');
    expect(privateView(t, 'c').visibleHands).toEqual({ b: cards('7s 8s 9s') });
    expectNoCards(privateView(t, 'a'), '7s 8s 9s Ah Kh 2c');
    expectNoCards(publicView(t), '7s 8s 9s Ah Kh 2c');
  });

  it('mixed: if anyone did not enter, the normal tap-winner flow runs and nothing is revealed', () => {
    // a only taps "I've looked"; b enters their hand.
    let t = act(dealt(['a', 'b']), { type: 'SEE', playerId: 'a' }, enter('b', 'As Ad 3c'), {
      type: 'SHOW',
      playerId: 'b',
    });
    expect(round(t).comparison!.method).toBe('tapWinner');
    expectNoCards(privateView(t, 'a'), 'As Ad 3c');
    t = act(
      t,
      { type: 'RESULT_TAP_WINNER', playerId: 'a', winnerIds: ['a'] },
      { type: 'RESULT_CONFIRM', playerId: 'b' },
    );
    expect(round(t).result).toMatchObject({ winnerIds: ['a'], resolution: 'tapWinner' });
    expectNoCards(publicView(t), 'As Ad 3c');
  });

  it('mixed with the "enter cards" setting: falls back to the card picker', () => {
    const t = act(dealt(['a', 'b'], { physicalResolution: 'enterCards' }), enter('a', 'As Ad 3c'), {
      type: 'SHOW',
      playerId: 'b',
    });
    expect(round(t).comparison!.method).toBe('enterCards');
  });

  it('dispute falls back to the tap-winner flow, then to the card picker', () => {
    let t = act(
      dealt(['a', 'b']),
      enter('a', 'Ks Kd 2c'),
      enter('b', 'As Ad 3c'),
      { type: 'SHOW', playerId: 'b' },
      { type: 'RESULT_DISPUTE', playerId: 'a' },
    );
    let c = round(t).comparison!;
    expect(c).toMatchObject({ method: 'tapWinner', proposal: null, enteredCards: {} });
    // The entered cards are no longer shown during the fallback.
    expect(privateView(t, 'a').visibleHands).toEqual({});
    t = act(
      t,
      { type: 'RESULT_TAP_WINNER', playerId: 'a', winnerIds: ['a'] },
      { type: 'RESULT_DISPUTE', playerId: 'b' },
    );
    c = round(t).comparison!;
    expect(c.method).toBe('enterCards');
    t = act(
      t,
      { type: 'RESULT_ENTER_CARDS', playerId: 'a', cards: cards('Ks Kd Kc') },
      { type: 'RESULT_ENTER_CARDS', playerId: 'b', cards: cards('As Ad 3c') },
    );
    expect(round(t).result).toMatchObject({ winnerIds: ['a'], resolution: 'enterCards' });
  });

  it('dispute with the "enter cards" setting goes straight to the card picker', () => {
    const t = act(
      dealt(['a', 'b'], { physicalResolution: 'enterCards' }),
      enter('a', 'Ks Kd 2c'),
      enter('b', 'As Ad 3c'),
      { type: 'SHOW', playerId: 'b' },
      { type: 'RESULT_DISPUTE', playerId: 'b' },
    );
    expect(round(t).comparison!.method).toBe('enterCards');
  });

  it('duplicate card: both re-check with the card picker; nothing is revealed first', () => {
    const res = applyAction(
      act(dealt(['a', 'b']), enter('a', 'As Kd 2c'), enter('b', 'As Ad 3c')),
      { type: 'SHOW', playerId: 'b' },
    );
    const { state: t, events } = ok(res);
    expect(round(t).comparison).toMatchObject({ method: 'enterCards', clash: true });
    expect(events).toContainEqual({ type: 'HANDS_CLASH', playerIds: ['b', 'a'] });
    // Neither sees the other's entered cards, and no "taken" cards are shown yet.
    expect(privateView(t, 'a')).toMatchObject({ visibleHands: {}, takenCards: [] });
    expectNoCards(privateView(t, 'a'), 'Ad 3c');
    expectNoCards(privateView(t, 'b'), 'Kd 2c');
    expectNoCards(publicView(t), 'As Kd 2c Ad 3c');
    const done = act(
      t,
      { type: 'RESULT_ENTER_CARDS', playerId: 'a', cards: cards('Ac Kd 2c') },
      { type: 'RESULT_ENTER_CARDS', playerId: 'b', cards: cards('As Ad 3c') },
    );
    expect(round(done).result).toMatchObject({ winnerIds: ['b'], resolution: 'enterCards' });
  });

  it('pot-limit show with 3 entered hands; equal best hands split the pot', () => {
    let t = act(
      dealt(['a', 'b', 'c'], { potLimit: 60 }),
      enter('a', 'As Kd 2c'),
      enter('b', 'Ah Kc 2d'),
      enter('c', '9s 7d 3c'),
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'CHAAL', playerId: 'c', amount: 20 },
    );
    const c = round(t).comparison!;
    expect(c).toMatchObject({ reason: 'potLimit', method: 'entered' });
    expect(c.proposal!.winnerIds.sort()).toEqual(['a', 'b']);
    for (const id of ['a', 'b', 'c']) t = act(t, { type: 'RESULT_CONFIRM', playerId: id });
    expect(round(t).result).toMatchObject({ reason: 'potLimit', resolution: 'entered' });
    expect(round(t).result!.winnerIds.sort()).toEqual(['a', 'b']);
  });

  it('undo replays entered hands exactly', () => {
    let t = act(dealt(['a', 'b', 'c']), enter('b', 'As Ad Kc'), {
      type: 'CHAAL',
      playerId: 'b',
      amount: 20,
    });
    t = act(t, { type: 'UNDO' });
    expect(rp(t, 'b')).toMatchObject({ entered: true, handLocked: false, hand: cards('As Ad Kc') });
  });
});
