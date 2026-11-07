import type { BetRange } from '@tpc/shared';
import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { chips } from '../../lib/format';
import { Sheet } from '../ui/Sheet';

function snap(v: number, r: BetRange): number {
  const steps = Math.round((v - r.min) / r.step);
  return Math.min(r.max, Math.max(r.min, r.min + steps * r.step));
}

/** Custom bet: a slider snapped to legal amounts plus quick picks. */
export function BetSheet({
  open,
  onClose,
  range,
  stake,
  onBet,
}: {
  open: boolean;
  onClose: () => void;
  range: BetRange;
  stake: number;
  onBet: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(range.min);
  useEffect(() => {
    if (open) setAmount(range.min);
  }, [open, range.min]);

  // Quick picks as multiples of the stake, kept only when legal.
  const quick = Array.from(
    new Set(
      [1, 2, 3, 4]
        .map((k) => k * stake)
        .filter((v) => v >= range.min && v <= range.max)
        .map((v) => snap(v, range)),
    ),
  );
  if (!quick.includes(range.min)) quick.unshift(range.min);
  if (!quick.includes(range.max)) quick.push(range.max);

  return (
    <Sheet open={open} onClose={onClose} title={t.bet.title} eyebrow={t.table.stake(stake)}>
      <div className="flex flex-col items-center gap-1">
        <span className="tabular font-display text-5xl font-bold text-gold-300">
          {chips(amount)}
        </span>
        <span className="text-sm text-ink-300">{t.bet.range(range.min, range.max)}</span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={amount}
        onChange={(e) => setAmount(snap(Number(e.target.value), range))}
        aria-label={t.bet.title}
        className="h-12 w-full accent-[#D9A93F]"
      />
      <div className="grid grid-cols-4 gap-2">
        {quick.slice(0, 4).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(v)}
            className={`min-h-[48px] rounded-xl text-[15px] font-semibold ${v === amount ? 'bg-ink-100 text-felt-950' : 'bg-panel'}`}
          >
            {chips(v)}
          </button>
        ))}
      </div>
      {range.step === 2 && <p className="text-center text-xs text-ink-500">{t.bet.evenOnly}</p>}
      <button
        type="button"
        onClick={() => onBet(amount)}
        className="min-h-[60px] rounded-2xl bg-gold-500 font-display text-lg font-bold text-gold-ink"
      >
        {t.actions.bet(amount)}
      </button>
    </Sheet>
  );
}
