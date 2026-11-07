import { describe, expect, it } from 'vitest';
import { ALL_CARDS, parseCards, type Card } from '../cards/cards';
import {
  compareHands,
  describeHand,
  evaluateHand,
  explainComparison,
  type A23Rank,
  type HandCategory,
} from './evaluator';

const h = parseCards;
const cmp = (a: string, b: string, a23Rank: A23Rank = 'second') =>
  compareHands(h(a), h(b), { a23Rank });
const cat = (cards: string) => evaluateHand(h(cards)).category;

describe('hand categories', () => {
  it.each<[string, HandCategory]>([
    ['7s 7h 7d', 'TRAIL'],
    ['5h 6h 7h', 'PURE_SEQUENCE'],
    ['5h 6d 7c', 'SEQUENCE'],
    ['2h 9h Kh', 'COLOR'],
    ['9s 9d 2c', 'PAIR'],
    ['2s 9d Kc', 'HIGH_CARD'],
  ])('%s is %s', (cards, category) => {
    expect(cat(cards)).toBe(category);
  });

  it('K-A-2 is not a sequence', () => {
    expect(cat('Kh Ad 2c')).toBe('HIGH_CARD');
    expect(cat('Ks As 2s')).toBe('COLOR');
  });

  it('Q-K-A and A-2-3 are sequences', () => {
    expect(cat('Qh Kd Ac')).toBe('SEQUENCE');
    expect(cat('Ah 2d 3c')).toBe('SEQUENCE');
    expect(cat('As 2s 3s')).toBe('PURE_SEQUENCE');
  });

  it('counts every possible 3-card hand correctly (22,100 hands)', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 52; i++)
      for (let j = i + 1; j < 52; j++)
        for (let k = j + 1; k < 52; k++) {
          const hand = [ALL_CARDS[i], ALL_CARDS[j], ALL_CARDS[k]] as Card[];
          const c = evaluateHand(hand).category;
          counts[c] = (counts[c] ?? 0) + 1;
        }
    expect(counts).toEqual({
      TRAIL: 52,
      PURE_SEQUENCE: 48,
      SEQUENCE: 720,
      COLOR: 1096,
      PAIR: 3744,
      HIGH_CARD: 16440,
    });
  });

  it('rejects hands that are not exactly 3 different cards', () => {
    expect(() => evaluateHand(h('As Kd'))).toThrow();
    expect(() => evaluateHand(h('As As Kd'))).toThrow();
  });
});

describe('ranking order (lowest of each rank beats highest of the next)', () => {
  it('Trail beats Pure sequence', () => expect(cmp('2s 2h 2d', 'As Ks Qs')).toBe(1));
  it('Pure sequence beats Sequence', () => expect(cmp('2s 3s 4s', 'Ah Kd Qc')).toBe(1));
  it('Sequence beats Color', () => expect(cmp('2h 3d 4c', 'As Ks Js')).toBe(1));
  it('Color beats Pair', () => expect(cmp('2s 3s 5s', 'Ah Ad Kc')).toBe(1));
  it('Pair beats High card', () => expect(cmp('2h 2d 3c', 'Ah Kd Jc')).toBe(1));
  it('with A-2-3 lowest, an A-2-3 pure sequence still beats every sequence', () =>
    expect(cmp('As 2s 3s', 'Ah Kd Qc', 'lowest')).toBe(1));
});

describe('trail', () => {
  it('AAA is the highest trail', () => expect(cmp('Ah Ad Ac', 'Kh Kd Kc')).toBe(1));
  it('222 is the lowest trail', () => expect(cmp('2h 2d 2c', '3h 3d 3c')).toBe(-1));
});

describe('sequences', () => {
  it('A-K-Q is the highest sequence', () => {
    expect(cmp('Ah Kd Qc', 'Ah 2d 3c')).toBe(1);
    expect(cmp('Ah Kd Qc', 'Kh Qd Jc')).toBe(1);
  });

  it('A-2-3 is second highest by default (above K-Q-J)', () => {
    expect(cmp('Ah 2d 3c', 'Kh Qd Jc')).toBe(1);
    expect(cmp('Ah 2d 3c', 'Ah Kd Qc')).toBe(-1);
  });

  it('A-2-3 is the lowest when the setting says so (below 2-3-4)', () => {
    expect(cmp('Ah 2d 3c', '2h 3d 4c', 'lowest')).toBe(-1);
    expect(cmp('Ah 2d 3c', 'Kh Qd Jc', 'lowest')).toBe(-1);
  });

  it('the setting also applies to pure sequences', () => {
    expect(cmp('As 2s 3s', 'Ks Qs Js', 'second')).toBe(1);
    expect(cmp('As 2s 3s', '2h 3h 4h', 'lowest')).toBe(-1);
  });

  it('higher top card wins between normal sequences', () =>
    expect(cmp('6h 7d 8c', '5h 6d 7c')).toBe(1));

  it('same sequence in different suits is a tie', () => {
    expect(cmp('Ah Kd Qc', 'As Kh Qd')).toBe(0);
    expect(cmp('Ah Kh Qh', 'As Ks Qs')).toBe(0);
  });
});

describe('color', () => {
  it('compares highest card, then next, then next', () => {
    expect(cmp('Ah Kh 5h', 'As Ks 4s')).toBe(1);
    expect(cmp('Ah 9h 5h', 'Ks Qs 9s')).toBe(1);
  });
  it('same ranks in different suits is a tie', () => expect(cmp('Ah Kh 5h', 'Ad Kd 5d')).toBe(0));
});

describe('pair', () => {
  it('higher pair wins', () => expect(cmp('Kh Kd 2c', 'Qh Qd Ac')).toBe(1));
  it('AA is the highest pair', () => expect(cmp('Ah Ad 2c', 'Kh Kd Ac')).toBe(1));
  it('same pair: kicker decides', () => expect(cmp('Kh Kd 5c', 'Ks Kc 4d')).toBe(1));
  it('same pair and kicker is a tie', () => expect(cmp('Kh Kd 5c', 'Ks Kc 5d')).toBe(0));
});

describe('high card', () => {
  it('compares highest card first', () => expect(cmp('As Kc 2d', 'Ah Qd Jc')).toBe(1));
  it('then the second card', () => expect(cmp('Ah Kd Jc', 'As Qc Jd')).toBe(1));
  it('then the third card', () => expect(cmp('Ah Kd 5c', 'As Kc 4d')).toBe(1));
  it('same ranks in different suits is a tie (suits never break ties)', () =>
    expect(cmp('Ah Kd Jc', 'As Kc Jd')).toBe(0));
});

describe('describeHand', () => {
  it.each([
    ['Ah Ad Ac', 'Trail of Aces'],
    ['6h 6d 6c', 'Trail of Sixes'],
    ['As 2s 3s', 'Pure sequence: A-2-3'],
    ['Qs Ks As', 'Pure sequence: Q-K-A'],
    ['5h 6d 7c', 'Sequence: 5-6-7'],
    ['Ah Th 4h', 'Color: A-10-4'],
    ['Kh Kd 2c', 'Pair of Kings'],
    ['Ah Td 4c', 'High card: A-10-4'],
  ])('%s is described as "%s"', (cards, name) => {
    expect(describeHand(h(cards))).toBe(name);
  });
});

describe('explainComparison', () => {
  const ex = (w: string, l: string) => explainComparison(evaluateHand(h(w)), evaluateHand(h(l)));
  it('different ranks', () => expect(ex('2s 5s 9s', 'Kh Kd 2c')).toBe('Color ranks above Pair'));
  it('different trails', () =>
    expect(ex('Ah Ad Ac', 'Kh Kd Kc')).toBe('three Aces beat three Kings'));
  it('different pairs', () =>
    expect(ex('Kh Kd 2c', 'Qh Qd Ac')).toBe('a pair of Kings beats a pair of Queens'));
  it('same pair, kicker', () =>
    expect(ex('Kh Kd 5c', 'Ks Kc 4d')).toBe('with the same pair, the Five beats the Four'));
  it('high card, first card', () =>
    expect(ex('As Kc 2d', 'Kh Qd 9c')).toBe('Ace beats King as the highest card'));
  it('high card, second card', () =>
    expect(ex('As Kc 2d', 'Ah Qd Jc')).toBe('King beats Queen as the second card'));
  it('high card, third card', () =>
    expect(ex('Ah Kd 5c', 'As Kc 4d')).toBe('Five beats Four as the third card'));
  it('sequences', () =>
    expect(ex('6h 7d 8c', '5h 6d 7c')).toBe('6-7-8 is a higher sequence than 5-6-7'));
  it('equal hands', () => expect(ex('Ah Kd Jc', 'As Kc Jd')).toBe('the hands are equal'));
});
