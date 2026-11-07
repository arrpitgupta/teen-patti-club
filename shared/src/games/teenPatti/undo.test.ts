import { describe, expect, it } from 'vitest';
import { replayRound } from './round';
import { applyAction } from './table';
import { act, expectError, makeTable, round, startWith } from './testUtils';

const HANDS = { a: '2s 4d 7c', b: 'Ah Kd 9c', c: '5s 5h 5d', d: '3s 8d Jc' };
const start = () => startWith(makeTable(['a', 'b', 'c', 'd']), HANDS);

describe('undo last action', () => {
  it('gives exactly the state from before the action', () => {
    const before = start();
    const after = act(before, { type: 'CHAAL', playerId: 'b', amount: 15 }, { type: 'UNDO' });
    expect(after.round).toEqual(before.round);
    expect(after.players).toEqual(before.players);
  });

  it('works for pack, side show request and side show deny', () => {
    let t = act(
      start(),
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'SEE', playerId: 'c' },
    );
    const beforeRequest = t;
    t = act(t, { type: 'SIDESHOW_REQUEST', playerId: 'c' });
    const beforeDeny = t;
    t = act(t, { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: false });
    const beforePack = t;
    t = act(t, { type: 'PACK', playerId: 'd' });

    t = act(t, { type: 'UNDO' });
    expect(t.round).toEqual(beforePack.round);
    t = act(t, { type: 'UNDO' });
    expect(t.round).toEqual(beforeDeny.round);
    t = act(t, { type: 'UNDO' });
    expect(t.round).toEqual(beforeRequest.round);
  });

  it('keeps "see cards" that happened after the undone action (seeing cannot be undone)', () => {
    const t = act(
      start(),
      { type: 'CHAAL', playerId: 'b', amount: 15 },
      { type: 'SEE', playerId: 'd' },
      { type: 'UNDO' },
    );
    const expected = act(start(), { type: 'SEE', playerId: 'd' });
    expect(t.round).toEqual(expected.round);
  });

  it('is recorded in the corrections log', () => {
    const t = act(start(), { type: 'CHAAL', playerId: 'b', amount: 15 }, { type: 'UNDO' });
    expect(t.corrections).toEqual([
      { type: 'UNDO', roundNumber: 1, undone: { type: 'CHAAL', playerId: 'b', amount: 15 } },
    ]);
  });

  it('has nothing to undo at the start, or when only cards were seen', () => {
    expectError(applyAction(start(), { type: 'UNDO' }), 'NOTHING_TO_UNDO');
    expectError(
      applyAction(act(start(), { type: 'SEE', playerId: 'a' }), { type: 'UNDO' }),
      'NOTHING_TO_UNDO',
    );
  });

  it('is not allowed once cards have been compared', () => {
    const t = act(
      start(),
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 20 },
      { type: 'SEE', playerId: 'c' },
      { type: 'SIDESHOW_REQUEST', playerId: 'c' },
      { type: 'SIDESHOW_RESPOND', playerId: 'b', accept: true },
      { type: 'CHAAL', playerId: 'd', amount: 10 },
    );
    expectError(applyAction(t, { type: 'UNDO' }), 'UNDO_NOT_ALLOWED');
  });

  it('is not allowed after the round has ended', () => {
    const t = act(
      start(),
      { type: 'PACK', playerId: 'b' },
      { type: 'PACK', playerId: 'c' },
      { type: 'PACK', playerId: 'd' },
    );
    expectError(applyAction(t, { type: 'UNDO' }), 'UNDO_NOT_ALLOWED');
  });
});

describe('replay', () => {
  it('replaying the action log from the round start gives the identical state', () => {
    const t = act(
      start(),
      { type: 'SEE', playerId: 'b' },
      { type: 'CHAAL', playerId: 'b', amount: 30 },
      { type: 'CHAAL', playerId: 'c', amount: 20 },
      { type: 'PACK', playerId: 'd' },
      { type: 'ADJUST', from: 'pot', to: 'a', amount: 5, reason: 'fix' },
    );
    expect(replayRound(t.roundInitial!, round(t).actions)).toEqual(t.round);
  });
});
