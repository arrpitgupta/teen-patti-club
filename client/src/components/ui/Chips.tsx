import { chips } from '../../lib/format';

const COLORS = [
  { min: 500, base: '#17171A', stripe: '#F4F1EA' },
  { min: 100, base: '#6B3FA0', stripe: '#F4F1EA' },
  { min: 50, base: '#B3132B', stripe: '#F4F1EA' },
  { min: 0, base: '#2F5D9E', stripe: '#F4F1EA' },
];

function chipColor(amount: number) {
  return COLORS.find((c) => amount >= c.min)!;
}

export function Chip({ amount, size = 18 }: { amount: number; size?: number }) {
  const c = chipColor(amount);
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
      style={{
        width: size,
        height: size,
        background: `repeating-conic-gradient(${c.base} 0deg 30deg, ${c.stripe} 30deg 45deg)`,
      }}
    />
  );
}

export function BetMarker({ amount }: { amount: number }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-felt-950/75 pl-[3px] pr-2.5">
      <Chip amount={amount} />
      <span className="tabular font-display text-[13px] font-semibold">{chips(amount)}</span>
    </span>
  );
}

export function DealerChip() {
  return (
    <span
      aria-label="Dealer"
      className="flex h-6 w-6 items-center justify-center rounded-full bg-card-face font-display text-xs font-bold text-card-black shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_0_0_2px_#8D897F]"
    >
      D
    </span>
  );
}

export function PotStack() {
  return (
    <span className="flex" aria-hidden="true">
      <Chip amount={50} />
      <span className="-ml-[7px]">
        <Chip amount={500} />
      </span>
      <span className="-ml-[7px]">
        <Chip amount={10} />
      </span>
    </span>
  );
}
