import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  cardLabel,
  createDeck,
  isCard,
  parseCards,
  rankOf,
  shuffle,
  suitOf,
} from './cards';

describe('cards', () => {
  it('a deck has 52 different cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('reads ranks and suits', () => {
    expect(rankOf('As')).toBe(14);
    expect(rankOf('Td')).toBe(10);
    expect(rankOf('2c')).toBe(2);
    expect(suitOf('Kh')).toBe('h');
    expect(cardLabel('Th')).toBe('10♥');
  });

  it('validates and parses card codes', () => {
    expect(isCard('As')).toBe(true);
    expect(isCard('1s')).toBe(false);
    expect(isCard('AS')).toBe(false);
    expect(parseCards('As Kd 2c')).toEqual(['As', 'Kd', '2c']);
    expect(() => parseCards('As Zz')).toThrow();
  });

  it('shuffle returns a permutation and uses the injected random source', () => {
    const fixed = shuffle(ALL_CARDS, () => 0);
    expect([...fixed].sort()).toEqual([...ALL_CARDS].sort());
    expect(fixed).not.toEqual(ALL_CARDS);
    // Same random source gives the same result (deterministic).
    expect(shuffle(ALL_CARDS, () => 0)).toEqual(fixed);
    // Identity when j always equals i.
    expect(shuffle(ALL_CARDS, (n) => n - 1)).toEqual(ALL_CARDS);
  });
});
