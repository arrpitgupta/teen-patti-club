import { rankLabel, rankOf, suitOf, type Card, type Rank } from '../cards/cards';

/** Low → high. The index is the category weight in the score. */
export const HAND_CATEGORIES = [
  'HIGH_CARD',
  'PAIR',
  'COLOR',
  'SEQUENCE',
  'PURE_SEQUENCE',
  'TRAIL',
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  TRAIL: 'Trail',
  PURE_SEQUENCE: 'Pure sequence',
  SEQUENCE: 'Sequence',
  COLOR: 'Color',
  PAIR: 'Pair',
  HIGH_CARD: 'High card',
};

/** Where A-2-3 ranks among sequences: right after A-K-Q, or below 2-3-4. */
export type A23Rank = 'second' | 'lowest';

export interface EvaluateOptions {
  a23Rank: A23Rank;
}

export const DEFAULT_EVALUATE_OPTIONS: EvaluateOptions = { a23Rank: 'second' };

export interface HandValue {
  category: HandCategory;
  /** Higher score = stronger hand. Equal scores are an exact tie (suits never matter). */
  score: number;
  /** Ranks sorted high → low (ace = 14). */
  ranks: [Rank, Rank, Rank];
  /** For pairs. */
  pair?: { rank: Rank; kicker: Rank };
  /** For sequences: ranks in display order, low → high (A-2-3 shown as [14, 2, 3]). */
  sequence?: [Rank, Rank, Rank];
}

const BASE = 15;
const CATEGORY_WEIGHT = BASE ** 3;

function make(
  category: HandCategory,
  tiebreak: number,
  ranks: [Rank, Rank, Rank],
  extra: Partial<HandValue> = {},
): HandValue {
  return {
    category,
    score: HAND_CATEGORIES.indexOf(category) * CATEGORY_WEIGHT + tiebreak,
    ranks,
    ...extra,
  };
}

/**
 * Tie-break value of a sequence, or null if the ranks are not a sequence.
 * Normal sequences use their top card (2-3-4 → 4 … J-Q-K → 13). A-K-Q is 16 (highest).
 * A-2-3 is 15 ("second") or 3 ("lowest", below 2-3-4). K-A-2 is not a sequence.
 */
function sequenceValue([a, b, c]: [Rank, Rank, Rank], a23Rank: A23Rank): number | null {
  if (a === b + 1 && b === c + 1) return a === 14 ? 16 : a;
  if (a === 14 && b === 3 && c === 2) return a23Rank === 'second' ? 15 : 3;
  return null;
}

export function evaluateHand(
  cards: readonly Card[],
  options: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS,
): HandValue {
  if (cards.length !== 3 || new Set(cards).size !== 3) {
    throw new Error('A hand needs exactly 3 different cards');
  }
  const [c0, c1, c2] = cards as [Card, Card, Card];
  const ranks = [rankOf(c0), rankOf(c1), rankOf(c2)].sort((x, y) => y - x) as [Rank, Rank, Rank];
  const [a, b, c] = ranks;
  const flush = suitOf(c0) === suitOf(c1) && suitOf(c1) === suitOf(c2);
  const highCardValue = a * BASE * BASE + b * BASE + c;

  if (a === b && b === c) return make('TRAIL', a, ranks);

  const seq = sequenceValue(ranks, options.a23Rank);
  if (seq !== null) {
    const display: [Rank, Rank, Rank] = a === 14 && b === 3 ? [14, 2, 3] : [c, b, a];
    return make(flush ? 'PURE_SEQUENCE' : 'SEQUENCE', seq, ranks, { sequence: display });
  }

  if (flush) return make('COLOR', highCardValue, ranks);

  if (a === b || b === c) {
    const pairRank = b;
    const kicker = a === b ? c : a;
    return make('PAIR', pairRank * BASE + kicker, ranks, { pair: { rank: pairRank, kicker } });
  }

  return make('HIGH_CARD', highCardValue, ranks);
}

/** 1 if a wins, -1 if b wins, 0 on an exact tie. */
export function compareHands(
  a: readonly Card[],
  b: readonly Card[],
  options: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS,
): -1 | 0 | 1 {
  return compareValues(evaluateHand(a, options), evaluateHand(b, options));
}

export function compareValues(a: HandValue, b: HandValue): -1 | 0 | 1 {
  return a.score > b.score ? 1 : a.score < b.score ? -1 : 0;
}

// ---------- Friendly text ----------

const RANK_WORDS: Record<number, [one: string, many: string]> = {
  2: ['Two', 'Twos'],
  3: ['Three', 'Threes'],
  4: ['Four', 'Fours'],
  5: ['Five', 'Fives'],
  6: ['Six', 'Sixes'],
  7: ['Seven', 'Sevens'],
  8: ['Eight', 'Eights'],
  9: ['Nine', 'Nines'],
  10: ['Ten', 'Tens'],
  11: ['Jack', 'Jacks'],
  12: ['Queen', 'Queens'],
  13: ['King', 'Kings'],
  14: ['Ace', 'Aces'],
};

const one = (r: Rank) => RANK_WORDS[r]![0];
const many = (r: Rank) => RANK_WORDS[r]![1];
const joinRanks = (rs: readonly Rank[]) => rs.map(rankLabel).join('-');

export function describeHandValue(v: HandValue): string {
  switch (v.category) {
    case 'TRAIL':
      return `Trail of ${many(v.ranks[0])}`;
    case 'PURE_SEQUENCE':
    case 'SEQUENCE':
      return `${CATEGORY_NAMES[v.category]}: ${joinRanks(v.sequence!)}`;
    case 'COLOR':
      return `Color: ${joinRanks(v.ranks)}`;
    case 'PAIR':
      return `Pair of ${many(v.pair!.rank)}`;
    case 'HIGH_CARD':
      return `High card: ${joinRanks(v.ranks)}`;
  }
}

/** Friendly name such as "Pair of Kings" or "Sequence: 5-6-7". */
export function describeHand(
  cards: readonly Card[],
  options: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS,
): string {
  return describeHandValue(evaluateHand(cards, options));
}

const POSITION = ['highest', 'second', 'third'] as const;

/** The "because …" part of a round recap. Always derived from the evaluator. */
export function explainComparison(winner: HandValue, loser: HandValue): string {
  if (winner.category !== loser.category) {
    return `${CATEGORY_NAMES[winner.category]} ranks above ${CATEGORY_NAMES[loser.category]}`;
  }
  if (winner.score === loser.score) return 'the hands are equal';

  switch (winner.category) {
    case 'TRAIL':
      return `three ${many(winner.ranks[0])} beat three ${many(loser.ranks[0])}`;
    case 'PURE_SEQUENCE':
    case 'SEQUENCE':
      return `${joinRanks(winner.sequence!)} is a higher sequence than ${joinRanks(loser.sequence!)}`;
    case 'PAIR': {
      const w = winner.pair!;
      const l = loser.pair!;
      if (w.rank !== l.rank) return `a pair of ${many(w.rank)} beats a pair of ${many(l.rank)}`;
      return `with the same pair, the ${one(w.kicker)} beats the ${one(l.kicker)}`;
    }
    case 'COLOR':
    case 'HIGH_CARD': {
      const i = winner.ranks.findIndex((r, idx) => r !== loser.ranks[idx]);
      return `${one(winner.ranks[i]!)} beats ${one(loser.ranks[i]!)} as the ${POSITION[i]!} card`;
    }
  }
}
