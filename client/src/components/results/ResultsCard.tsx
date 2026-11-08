import type { GameResults } from '@tpc/shared';
import { motion } from 'framer-motion';
import { forwardRef } from 'react';
import { Avatar } from '../ui/Avatar';
import { t } from '../../i18n';
import { chips, net, rupees } from '../../lib/format';

export function amountText(n: number, rate: number | null): string {
  const r = rupees(n, rate);
  return r
    ? `${chips(Math.abs(n))} ${t.common.chips} (${r})`
    : `${chips(Math.abs(n))} ${t.common.chips}`;
}

/** Podium, full ranking and settle-up. Used on the End Game screen and the public results page. */
export const ResultsCard = forwardRef<
  HTMLDivElement,
  { eyebrow: string; res: GameResults; nameOf: (id: string) => string }
>(function ResultsCard({ eyebrow, res, nameOf }, ref) {
  const podium = res.rankings.slice(0, 3);
  // Visual order 2nd, 1st, 3rd.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const heights: Record<number, number> = { 0: 112, 1: 80, 2: 60 };
  return (
    <div ref={ref} className="flex flex-col gap-6 rounded-3xl bg-felt-950 p-1">
      <header className="text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
          {eyebrow}
        </span>
        <h1 className="font-display text-3xl font-bold">{t.results.title}</h1>
      </header>

      <div className="flex items-end justify-center gap-3" aria-hidden="true">
        {podiumOrder.map((r) => {
          const place = res.rankings.indexOf(r!);
          return (
            <motion.div
              key={r!.playerId}
              className="flex w-24 flex-col items-center gap-2"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 + (2 - place) * 0.25, type: 'spring', damping: 16 }}
            >
              <Avatar
                id={r!.playerId}
                name={r!.name}
                avatar={r!.avatar}
                size={place === 0 ? 64 : 52}
                ring={place === 0 ? 'turn' : null}
              />
              <span className="max-w-full truncate text-sm font-semibold">{r!.name}</span>
              <span
                className={`tabular font-display text-sm font-bold ${r!.net >= 0 ? 'text-up' : 'text-down'}`}
              >
                {net(r!.net)}
              </span>
              <div
                className="flex w-full items-start justify-center rounded-t-xl bg-panel pt-2 font-display text-2xl font-bold text-ink-300"
                style={{ height: heights[place] }}
              >
                {place + 1}
              </div>
            </motion.div>
          );
        })}
      </div>

      <ol className="flex flex-col gap-2">
        {res.rankings.map((r, i) => (
          <li key={r.playerId} className="flex items-center gap-3 rounded-2xl bg-panel p-3">
            <span className="w-5 text-center font-display font-bold text-ink-300">{i + 1}</span>
            <Avatar id={r.playerId} name={r.name} avatar={r.avatar} size={40} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold">{r.name}</span>
              <span className="text-xs text-ink-300">
                {t.results.rounds(r.roundsPlayed, r.roundsWon)}
                {r.biggestPotWon > 0 && ` · ${t.results.biggest(r.biggestPotWon)}`}
              </span>
              {r.bestHand && (
                <span className="text-xs text-ink-300">{t.results.best(r.bestHand.name)}</span>
              )}
            </div>
            <span
              className={`tabular font-display text-lg font-bold ${r.net > 0 ? 'text-up' : r.net < 0 ? 'text-down' : 'text-ink-300'}`}
            >
              {net(r.net)}
            </span>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">{t.results.settle}</h2>
        {res.payments.length === 0 ? (
          <p className="text-ink-300">{t.results.settleNone}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {res.payments.map((p, i) => (
              <li key={i} className="rounded-2xl bg-ink-100/[0.06] p-3 text-[15px]">
                {t.results.pays(nameOf(p.from), nameOf(p.to), amountText(p.amount, res.chipRate))}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-500">{t.virtualOnly}</p>
      </section>
    </div>
  );
});
