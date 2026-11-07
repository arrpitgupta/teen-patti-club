import { t } from '../../i18n';
import type { TableModel } from '../../lib/model';
import { act } from '../../lib/socket';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';

/** Physical mode, before betting: the host deals real cards, then taps "Cards dealt". */
export function DealPanel({ m }: { m: TableModel }) {
  const r = m.round!;
  // Dealing order: clockwise from the player left of the dealer, dealer last.
  const bySeat = [...r.players].sort((a, b) => a.seat - b.seat);
  const start = Math.max(
    0,
    bySeat.findIndex((p) => p.seat > r.dealerSeat),
  );
  const order = [...bySeat.slice(start), ...bySeat.slice(0, start)];
  const first = order[0];
  const dealer = order[order.length - 1];

  return (
    <div
      className={`relative flex flex-col gap-3 rounded-t-[22px] bg-felt-900 px-3.5 pt-3 pb-safe ${m.isHost ? 'shadow-dock' : ''}`}
    >
      {m.isHost ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="font-display text-lg font-bold">{t.physical.dealTitle}</span>
            {first && (
              <span className="text-[13px] text-ink-300">
                {t.physical.dealOrder(m.nameOf(first.id))}
              </span>
            )}
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={t.physical.dealTitle}>
            {order.map((p, i) => {
              const pl = m.playerOf(p.id);
              return (
                <li key={p.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
                  <span className="relative">
                    {pl && <Avatar id={pl.id} name={pl.name} avatar={pl.avatar} size={40} />}
                    <span className="absolute -left-2 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-felt-950">
                      {i + 1}
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-xs font-semibold">
                    {m.nameOf(p.id)}
                  </span>
                </li>
              );
            })}
          </ol>
          <span className="text-[13px] text-ink-300">
            {t.physical.potAfterBoot(r.pot, r.rules.boot)}
            {dealer && ` · ${t.table.dealer}: ${m.nameOf(dealer.id)}`}
          </span>
          <button
            type="button"
            onClick={() => void act('round:cardsDealt', {})}
            className="flex min-h-[64px] items-center justify-center gap-2.5 rounded-2xl bg-gold-500 font-display text-lg font-bold text-gold-ink shadow-[0_6px_18px_rgba(217,169,63,0.35)]"
          >
            <Icon name="check" size={22} strokeWidth={2.6} />
            {t.physical.dealDone}
          </button>
        </>
      ) : (
        <p className="py-3 text-center text-[15px] font-semibold">{t.physical.waitingDeal}</p>
      )}
    </div>
  );
}
