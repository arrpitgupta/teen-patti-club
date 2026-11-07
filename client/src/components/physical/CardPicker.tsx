import { describeHand, type A23Rank, type Card } from '@tpc/shared';
import { useState } from 'react';
import { t } from '../../i18n';
import { CardFace, CardSlot, cardName } from '../ui/PlayingCard';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const SUITS = [
  { key: 's', sym: '♠︎', red: false },
  { key: 'h', sym: '♥︎', red: true },
  { key: 'd', sym: '♦︎', red: true },
  { key: 'c', sym: '♣︎', red: false },
] as const;

const label = (r: string) => (r === 'T' ? '10' : r);

/**
 * 13 ranks × 4 suits. In a card-picker show, cards other players already picked are struck
 * through. For "Enter my hand" `taken` is empty: all 52 stay selectable so nothing leaks.
 */
export function CardPicker({
  taken,
  a23Rank,
  onSubmit,
  initial = [],
  intro = t.physical.pickCardsBody,
  submitLabel = t.physical.submitCards,
}: {
  taken: readonly Card[];
  a23Rank: A23Rank;
  onSubmit: (cards: Card[]) => void;
  initial?: readonly Card[];
  intro?: string;
  submitLabel?: string;
}) {
  const [picked, setPicked] = useState<Card[]>(() => [...initial]);
  const takenSet = new Set(taken);
  const toggle = (c: Card) =>
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length < 3 ? [...p, c] : p));
  const handName = picked.length === 3 ? describeHand(picked, { a23Rank }) : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p className="text-[14px] leading-snug text-ink-300">{intro}</p>

      <div className="flex items-center gap-2.5">
        {[0, 1, 2].map((i) => {
          const c = picked[i];
          return c ? (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              aria-label={`Remove ${cardName(c)}`}
            >
              <CardFace card={c} size="sm" />
            </button>
          ) : (
            <CardSlot key={i} size="sm" label={String(i + 1)} />
          );
        })}
        <div className="ml-1 flex min-w-0 flex-col gap-0.5">
          {handName && <span className="text-[14px] font-bold">{handName}</span>}
          <span className="text-xs text-ink-500">{t.physical.removeHint}</span>
        </div>
      </div>

      <div className="grid grid-cols-[30px_repeat(4,minmax(0,1fr))] gap-1.5">
        <span />
        {SUITS.map((s) => (
          <span
            key={s.key}
            className={`text-center text-xl ${s.red ? 'text-suit-red' : 'text-ink-100'}`}
            aria-hidden="true"
          >
            {s.sym}
          </span>
        ))}
        {RANKS.map((r) => (
          <Row key={r} rank={r} picked={picked} taken={takenSet} onToggle={toggle} />
        ))}
      </div>

      {taken.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <span className="font-display text-[13px] font-semibold line-through">Q♦&#xFE0E;</span>
          {t.physical.takenHint}
        </p>
      )}

      <button
        type="button"
        disabled={picked.length !== 3}
        onClick={() => onSubmit(picked)}
        className="min-h-[58px] rounded-2xl bg-gold-500 font-display text-base font-bold text-gold-ink disabled:bg-panel-sunk disabled:text-ink-500"
      >
        {picked.length === 3 ? submitLabel : t.physical.pickMore(3 - picked.length)}
      </button>
    </div>
  );
}

function Row({
  rank,
  picked,
  taken,
  onToggle,
}: {
  rank: string;
  picked: Card[];
  taken: Set<Card>;
  onToggle: (c: Card) => void;
}) {
  return (
    <>
      <span className="flex items-center justify-center font-display text-sm font-semibold text-ink-500">
        {label(rank)}
      </span>
      {SUITS.map((s) => {
        const card = `${rank}${s.key}` as Card;
        const isPicked = picked.includes(card);
        const isTaken = taken.has(card);
        const text = `${label(rank)}${s.sym}`;
        if (isTaken) {
          return (
            <button
              key={card}
              type="button"
              disabled
              aria-label={`${cardName(card)}, picked by someone else`}
              className="h-11 rounded-[10px] bg-ink-100/[0.03] font-display text-[15px] font-semibold text-ink-500 line-through"
            >
              {text}
            </button>
          );
        }
        return (
          <button
            key={card}
            type="button"
            aria-pressed={isPicked}
            aria-label={cardName(card)}
            onClick={() => onToggle(card)}
            className={[
              'h-11 rounded-[10px] font-display text-base font-bold',
              isPicked
                ? `bg-card-face shadow-[0_0_0_2px_#072117,0_0_0_4px_#F4F1EA] ${s.red ? 'text-card-red' : 'text-card-black'}`
                : `bg-[#12382A] shadow-[inset_0_0_0_1px_rgba(244,241,234,0.1)] ${s.red ? 'text-suit-red' : 'text-ink-100'}`,
            ].join(' ')}
          >
            {isPicked ? `✓ ${text}` : text}
          </button>
        );
      })}
    </>
  );
}
