import {
  evaluateHand,
  HAND_CATEGORIES,
  parseCards,
  type A23Rank,
  type Card,
  type HandCategory,
} from '@tpc/shared';
import { t } from '../../i18n';
import { CardFace } from '../ui/PlayingCard';
import { Sheet } from '../ui/Sheet';

const EXAMPLES: Record<HandCategory, string> = {
  TRAIL: 'As Ah Ad',
  PURE_SEQUENCE: '5h 6h 7h',
  SEQUENCE: 'Qs Kd Ac',
  COLOR: 'Ac Tc 4c',
  PAIR: 'Ks Kh 7d',
  HIGH_CARD: 'As Jd 9c',
};

export function RankingsSheet({
  open,
  onClose,
  hand,
  a23Rank,
}: {
  open: boolean;
  onClose: () => void;
  hand: Card[] | null;
  a23Rank: A23Rank;
}) {
  const mine = hand ? evaluateHand(hand, { a23Rank }).category : null;
  const order = [...HAND_CATEGORIES].reverse();
  return (
    <Sheet open={open} onClose={onClose} title={t.rankings.title}>
      <p className="-mt-2 text-sm text-ink-300">{t.rankings.subtitle}</p>
      <ol className="flex flex-col gap-2">
        {order.map((cat, i) => {
          const [name, desc] = t.rankings.names[cat]!;
          const isMine = cat === mine;
          return (
            <li
              key={cat}
              className={`flex items-center gap-3 rounded-2xl p-3 ${isMine ? 'bg-ink-100/10 shadow-[inset_0_0_0_2px_#F4F1EA]' : 'bg-panel'}`}
            >
              <span className="w-5 text-center font-display font-bold text-ink-300">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">
                  {name}
                  {isMine && (
                    <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-felt-950">
                      {t.rankings.yourHand}
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-ink-300">{desc}</span>
              </div>
              <span className="flex gap-0.5">
                {parseCards(EXAMPLES[cat]).map((c) => (
                  <CardFace key={c} card={c} size="xs" />
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] text-ink-300">
        {a23Rank === 'second' ? t.rankings.a23Second : t.rankings.a23Lowest}
      </p>
    </Sheet>
  );
}
