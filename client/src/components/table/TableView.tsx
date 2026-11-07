import type { GameLogEvent } from '@tpc/shared';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

function useHeight(ref: RefObject<HTMLElement>): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}
import { t } from '../../i18n';
import { chips } from '../../lib/format';
import { joinNames, type TableModel } from '../../lib/model';
import { useServerNow } from '../../lib/useNow';
import { BetMarker, DealerChip, PotStack } from '../ui/Chips';
import { Icon } from '../ui/Icon';
import { InlineToasts } from '../ui/Toasts';
import { seatSpots } from './layout';
import { Seat } from './Seat';

/** Last bet per player in the current round, from the event log. */
function lastBets(m: TableModel): Map<string, number> {
  const bets = new Map<string, number>();
  const r = m.round;
  if (!r || r.phase === 'ENDED') return bets;
  for (const { event } of m.pub.log) {
    const e = event as GameLogEvent;
    if (e.type === 'ROUND_STARTED') bets.clear();
    if (e.type === 'BET' || e.type === 'SIDESHOW_REQUESTED' || e.type === 'SHOW_REQUESTED') {
      bets.set(e.playerId, e.amount);
    }
  }
  return bets;
}

export function TableView({ m, wide }: { m: TableModel; wide: boolean }) {
  const now = useServerNow();
  const box = useRef<HTMLDivElement>(null);
  const height = useHeight(box);
  const seatCount = m.pub.players.filter((p) => p.present).length - 1;
  // Compact seats for crowded tables or short screens (small phones).
  const compact = seatCount >= 6 || (height > 0 && height < 380);
  const spots = useMemo(
    () => seatSpots(m.pub, m.meId, wide, compact),
    [m.pub, m.meId, wide, compact],
  );
  const bets = useMemo(() => lastBets(m), [m]);
  const r = m.round;
  const roundRunning = !!r && r.phase !== 'ENDED';
  const timer = m.pub.timer;
  const overdueId = timer?.kind === 'overdue' ? timer.playerId : null;
  const timerLeft =
    timer && timer.kind === 'turn'
      ? Math.max(0, Math.min(1, (timer.deadline - now) / timer.durationMs))
      : null;
  const dealerId = r ? m.pub.players.find((p) => p.seat === r.dealerSeat)?.id : undefined;
  const aspect = 900 / 480;

  return (
    <div
      ref={box}
      className="flex h-full w-full items-center justify-center"
      style={{ containerType: 'size' }}
    >
      <div
        className="relative"
        style={
          wide
            ? { width: `min(100cqw, calc(100cqh * ${aspect}))`, aspectRatio: String(aspect) }
            : // Phones: use the full width; never taller than 1.25× the width.
              { width: '100cqw', height: 'min(100cqh, calc(100cqw * 1.25))' }
        }
      >
        <div className="rail absolute inset-[2%] rounded-[50%]">
          <div className="felt absolute inset-[12px] rounded-[50%]" />
        </div>

        <Centre
          m={m}
          now={now}
          wide={wide}
          small={height > 0 && height < 380}
          maxToasts={compact ? 1 : 2}
        />

        {spots.map((s) => {
          const p = m.playerOf(s.id)!;
          const bet = bets.get(s.id);
          // Markers sit beside the avatar, on the side facing the centre (as in the mock).
          const side = s.x <= 50.5 ? 1 : -1;
          const half = compact ? 21 : 24;
          const markerOffset = compact ? 46 : 56;
          return (
            <div key={s.id}>
              {bet !== undefined && (
                <div
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `calc(${s.x}% + ${side * markerOffset}px)`, top: `${s.y}%` }}
                >
                  <BetMarker amount={bet} />
                </div>
              )}
              {dealerId === s.id && (
                <div
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `calc(${s.x}% + ${side * (half + 6)}px)`,
                    top: `calc(${s.y}% + ${half - 2}px)`,
                  }}
                >
                  <DealerChip />
                </div>
              )}
              <div
                className="absolute"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  transform: `translate(-50%, -${half}px)`,
                }}
              >
                <Seat
                  player={p}
                  rp={m.rpOf(s.id)}
                  roundRunning={roundRunning}
                  isTurn={m.waitingOn === s.id}
                  overdue={overdueId === s.id}
                  timerLeft={m.waitingOn === s.id ? timerLeft : null}
                  compact={compact}
                  openTab={m.openTab}
                  sittingOut={roundRunning && !m.rpOf(s.id)}
                  isHost={m.pub.hostPlayerId === s.id}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Centre({
  m,
  now,
  wide,
  small,
  maxToasts,
}: {
  m: TableModel;
  now: number;
  wide: boolean;
  small: boolean;
  maxToasts: number;
}) {
  const r = m.round;
  const timer = m.pub.timer;
  const overdue = timer?.kind === 'overdue' ? timer : null;
  const comparing =
    r?.phase === 'AWAITING_RESULT' && r.comparison && !r.comparison.playerIds.includes(m.meId)
      ? joinNames(r.comparison.playerIds.map(m.nameOf))
      : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[8%] flex flex-col items-center justify-center gap-3">
      {r ? (
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            {!small && <PotStack />}
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-300">
              {t.table.pot}
            </span>
          </div>
          <span
            className={`tabular font-display font-bold leading-tight text-gold-300 ${wide ? 'text-5xl' : small ? 'text-[32px]' : 'text-[40px]'}`}
            aria-live="polite"
          >
            {chips(r.phase === 'ENDED' ? (r.result?.pot ?? 0) : r.pot)}
          </span>
          <span className="mt-1 flex h-6 items-center rounded-full bg-felt-950/55 px-2.5 text-xs font-semibold">
            {t.table.stake(r.stake)}
            {wide && r.rules.potLimit !== null && ` · ${t.table.potLimit(r.rules.potLimit)}`}
          </span>
        </div>
      ) : (
        <span className="text-sm text-ink-300">{t.table.lobbyNotStarted}</span>
      )}

      {overdue && (
        <div className="flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-overdue pl-3 pr-4 text-felt-950 shadow-[0_0_0_4px_rgba(255,159,67,0.25)]">
          <Icon name="clock" size={20} strokeWidth={2.4} />
          <span className="font-display text-[15px] font-bold">
            {t.table.waitingFor(m.nameOf(overdue.playerId))}
          </span>
          {wide && (
            <span className="text-[13px] font-semibold opacity-80">
              {t.table.overdueSince(Math.max(0, Math.round((now - overdue.deadline) / 1000)))}
            </span>
          )}
        </div>
      )}

      {comparing && (
        <span className="max-w-[70%] rounded-full bg-felt-950/80 px-3 py-1.5 text-center text-[13px] font-semibold">
          {t.table.comparing(comparing)}
        </span>
      )}

      <InlineToasts max={maxToasts} />
    </div>
  );
}
