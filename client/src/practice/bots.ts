import {
  evaluateHand,
  legalActions,
  type Card,
  type TableAction,
  type TableState,
} from '@tpc/shared';

export interface BotProfile {
  id: string;
  name: string;
  avatar: string;
  /** 0 = careful (packs weak hands), 1 = bold (bets and bluffs more). */
  boldness: number;
}

export const BOTS: BotProfile[] = [
  { id: 'bot-asha', name: 'Asha', avatar: '🦊', boldness: 0.35 },
  { id: 'bot-rohit', name: 'Rohit', avatar: '🐯', boldness: 0.7 },
  { id: 'bot-dev', name: 'Dev', avatar: '🦉', boldness: 0.15 },
  { id: 'bot-meera', name: 'Meera', avatar: '🦄', boldness: 0.5 },
  { id: 'bot-kabir', name: 'Kabir', avatar: '🐼', boldness: 0.85 },
];

const CATEGORY_STRENGTH: Record<string, number> = {
  HIGH_CARD: 0,
  PAIR: 0.55,
  COLOR: 0.72,
  SEQUENCE: 0.82,
  PURE_SEQUENCE: 0.92,
  TRAIL: 0.98,
};

/** Rough 0..1 strength of a 3-card hand (category first, then how high it is). */
export function handStrength(hand: readonly Card[], a23Rank: 'second' | 'lowest'): number {
  const v = evaluateHand(hand, { a23Rank });
  const base = CATEGORY_STRENGTH[v.category] ?? 0;
  const top = (v.pair?.rank ?? v.ranks[0]) - 2; // 0..12
  const spread = v.category === 'HIGH_CARD' ? 0.5 : 0.06;
  return Math.min(1, base + (top / 12) * spread);
}

/**
 * A simple bot: plays blind for a while, looks at its cards, then bets by hand strength with
 * some randomness. Always returns a legal action for the bot (the caller applies it).
 */
export function botMove(
  t: TableState,
  bot: BotProfile,
  rng: () => number = Math.random,
): TableAction | null {
  const r = t.round;
  if (!r) return null;
  const me = r.players.find((p) => p.id === bot.id);
  if (!me || me.packed || !me.hand) return null;
  const L = legalActions(t, bot.id);
  const strength = handStrength(me.hand, r.rules.a23Rank);
  const bold = bot.boldness;

  if (L.canRespondSideShow) {
    // Accept with a decent hand (side shows favour the one who is asked on a tie).
    return {
      type: 'SIDESHOW_RESPOND',
      playerId: bot.id,
      accept: strength > 0.35 || rng() < 0.2 + bold * 0.3,
    };
  }
  if (!L.isTurn) return null;

  if (!me.seen) {
    const lookChance = 0.25 + me.blindBets * 0.25 - bold * 0.15;
    if (L.mustSee || !L.bet || rng() < lookChance) return { type: 'SEE', playerId: bot.id };
    const amount = L.bet.max > L.bet.min && rng() < bold * 0.5 ? L.bet.max : L.bet.min;
    return { type: 'CHAAL', playerId: bot.id, amount };
  }

  const pressure = r.stake / r.rules.boot; // how expensive it has become
  const bluff = rng() < bold * 0.25;
  if (L.show && (strength > 0.6 - bold * 0.1 || (pressure > 8 && strength > 0.4))) {
    return { type: 'SHOW', playerId: bot.id };
  }
  if (!bluff && strength < 0.18 + pressure * 0.02 && rng() > bold * 0.5) {
    return { type: 'PACK', playerId: bot.id };
  }
  if (L.sideShow && strength > 0.25 && strength < 0.6 && rng() < 0.35) {
    return { type: 'SIDESHOW_REQUEST', playerId: bot.id };
  }
  if (!L.bet)
    return L.show ? { type: 'SHOW', playerId: bot.id } : { type: 'PACK', playerId: bot.id };
  const raise = (strength > 0.65 || bluff) && rng() < 0.5 + bold * 0.3;
  return { type: 'CHAAL', playerId: bot.id, amount: raise ? L.bet.max : L.bet.min };
}
