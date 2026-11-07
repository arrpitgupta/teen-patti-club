export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];

export const RANK_CHARS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
] as const;
export type RankChar = (typeof RANK_CHARS)[number];

/** A card code such as "As" (ace of spades) or "Td" (ten of diamonds). */
export type Card = `${RankChar}${Suit}`;

/** Rank value: 2..14, ace high. */
export type Rank = number;

export const ALL_CARDS: readonly Card[] = RANK_CHARS.flatMap((r) =>
  SUITS.map((s) => `${r}${s}` as Card),
);

const CARD_SET = new Set<string>(ALL_CARDS);

export function isCard(value: unknown): value is Card {
  return typeof value === 'string' && CARD_SET.has(value);
}

export function rankOf(card: Card): Rank {
  return RANK_CHARS.indexOf(card.charAt(0) as RankChar) + 2;
}

export function suitOf(card: Card): Suit {
  return card.charAt(1) as Suit;
}

export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .map((code) => {
      if (!isCard(code)) throw new Error(`Invalid card: ${code}`);
      return code;
    });
}

export const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    default:
      return String(rank);
  }
}

export function cardLabel(card: Card): string {
  return `${rankLabel(rankOf(card))}${SUIT_SYMBOLS[suitOf(card)]}`;
}

export function createDeck(): Card[] {
  return [...ALL_CARDS];
}

/** Returns a uniform random integer in [0, maxExclusive). Server uses crypto.randomInt. */
export type RandomInt = (maxExclusive: number) => number;

/** Fisher–Yates shuffle with an injected random source (keeps the engine pure). */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
