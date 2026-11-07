import { rankLabel, rankOf, suitOf, type Card } from '@tpc/shared';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

// Text-presentation selector keeps suits from turning into emoji on phones.
const SUIT: Record<string, string> = { s: '♠︎', h: '♥︎', d: '♦︎', c: '♣︎' };
const SUIT_NAME: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_NAME: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };

export type CardSize = 'lg' | 'md' | 'sm' | 'xs';

const DIMS: Record<CardSize, { w: number; h: number; rank: number; pip: number; center: number }> =
  {
    lg: { w: 84, h: 118, rank: 22, pip: 16, center: 44 },
    md: { w: 70, h: 98, rank: 19, pip: 14, center: 36 },
    sm: { w: 54, h: 76, rank: 17, pip: 13, center: 28 },
    xs: { w: 30, h: 42, rank: 13, pip: 12, center: 0 },
  };

export function suitSymbol(card: Card): string {
  return SUIT[suitOf(card)]!;
}

export function isRed(card: Card): boolean {
  const s = suitOf(card);
  return s === 'h' || s === 'd';
}

export function cardName(card: Card): string {
  const r = rankLabel(rankOf(card));
  return `${RANK_NAME[r] ?? r} of ${SUIT_NAME[suitOf(card)]}`;
}

export function CardFace({ card, size = 'lg' }: { card: Card; size?: CardSize }) {
  const d = DIMS[size];
  const rank = rankLabel(rankOf(card));
  const color = isRed(card) ? 'text-card-red' : 'text-card-black';
  if (size === 'xs') {
    return (
      <span
        role="img"
        aria-label={cardName(card)}
        className={`flex shrink-0 flex-col items-center justify-center rounded-[5px] bg-card-face font-display font-bold leading-none ${color}`}
        style={{ width: d.w, height: d.h, fontSize: d.rank }}
      >
        {rank}
        <span style={{ fontSize: d.pip }}>{suitSymbol(card)}</span>
      </span>
    );
  }
  return (
    <div
      role="img"
      aria-label={cardName(card)}
      className={`relative shrink-0 rounded-[10px] bg-card-face font-display shadow-card ${color}`}
      style={{ width: d.w, height: d.h }}
    >
      <div className="absolute left-2 top-1.5 flex flex-col items-center leading-none">
        <span
          className="font-bold"
          style={{
            fontSize: rank === '10' ? d.rank - 3 : d.rank,
            letterSpacing: rank === '10' ? '-0.04em' : undefined,
          }}
        >
          {rank}
        </span>
        <span style={{ fontSize: d.pip }}>{suitSymbol(card)}</span>
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ fontSize: d.center }}
      >
        {suitSymbol(card)}
      </div>
    </div>
  );
}

export function CardBack({ size = 'lg' }: { size?: CardSize }) {
  const d = DIMS[size];
  return (
    <div
      aria-hidden="true"
      className="card-back shrink-0 rounded-[10px]"
      style={{ width: d.w, height: d.h }}
    />
  );
}

export function CardSlot({ size = 'lg', label }: { size?: CardSize; label?: string }) {
  const d = DIMS[size];
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[10px] border-2 border-dashed border-ink-100/35 font-display text-xl font-semibold text-ink-300"
      style={{ width: d.w, height: d.h }}
    >
      {label}
    </div>
  );
}

/** A card that flips from its back to its face in 3D when `card` becomes known. */
export function FlipCard({ card, size = 'lg' }: { card: Card | null; size?: CardSize }) {
  const reduce = useReducedMotion();
  const d = DIMS[size];
  if (reduce) return card ? <CardFace card={card} size={size} /> : <CardBack size={size} />;
  return (
    <div style={{ width: d.w, height: d.h, perspective: 800 }} className="shrink-0">
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: card ? 180 : 0 }}
        transition={{ duration: 0.55, ease: [0.3, 0.7, 0.2, 1] }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <CardBack size={size} />
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {card && <CardFace card={card} size={size} />}
        </div>
      </motion.div>
    </div>
  );
}

/** Three cards fanned out. */
export function Fan({
  children,
  overlap = 18,
  tilt = 9,
}: {
  children: ReactNode[];
  overlap?: number;
  tilt?: number;
}) {
  return (
    <div className="flex items-end">
      {children.map((c, i) => {
        const offset = i - (children.length - 1) / 2;
        return (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : -overlap,
              transform: `rotate(${offset * tilt}deg) translateY(${Math.abs(offset) * 6}px)`,
              zIndex: i,
            }}
          >
            {c}
          </div>
        );
      })}
    </div>
  );
}
