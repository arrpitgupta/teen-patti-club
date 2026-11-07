import { describe, expect, it } from 'vitest';
import { act, makeTable, round, startWith } from './testUtils';
import { privateView, publicView } from './views';

const HANDS = { a: '2s 4d 7c', b: 'Ah Kd 9c', c: '5s 5h 5d' };
const ALL = Object.values(HANDS).flatMap((h) => h.split(' '));

function containsAnyCard(value: unknown, cards: string[]): boolean {
  const json = JSON.stringify(value);
  return cards.some((c) => json.includes(`"${c}"`));
}

describe('what each player is allowed to see', () => {
  it('the public table state never contains cards before a reveal', () => {
    const t = act(startWith(makeTable(['a', 'b', 'c']), HANDS), { type: 'SEE', playerId: 'b' });
    expect(containsAnyCard(publicView(t), ALL)).toBe(false);
  });

  it('a blind player does not get their own cards; after seeing, they get only theirs', () => {
    let t = startWith(makeTable(['a', 'b', 'c']), HANDS);
    expect(privateView(t, 'b').hand).toBeNull();
    t = act(t, { type: 'SEE', playerId: 'b' });
    const view = privateView(t, 'b');
    expect(view.hand).toEqual(['Ah', 'Kd', '9c']);
    const others = [...HANDS.a.split(' '), ...HANDS.c.split(' ')];
    expect(containsAnyCard(view, others)).toBe(false);
  });

  it('after a show, the revealed hands are public', () => {
    const t = act(
      startWith(makeTable(['a', 'b', 'c']), HANDS),
      { type: 'PACK', playerId: 'b' },
      { type: 'SHOW', playerId: 'c' },
    );
    expect(publicView(t).round!.result!.revealedHands).toEqual({
      a: ['2s', '4d', '7c'],
      c: ['5s', '5h', '5d'],
    });
    // b packed and was never part of the show.
    expect(containsAnyCard(publicView(t), HANDS.b.split(' '))).toBe(false);
  });

  it('public players carry a simple status: blind, seen or packed', () => {
    const t = act(
      startWith(makeTable(['a', 'b', 'c']), HANDS),
      { type: 'SEE', playerId: 'c' },
      { type: 'PACK', playerId: 'b' },
    );
    expect(publicView(t).round!.players.map((p) => p.status)).toEqual(['blind', 'packed', 'seen']);
    expect(round(t).phase).toBe('BETTING');
  });
});
