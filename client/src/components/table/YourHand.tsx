import type { Card } from '@tpc/shared';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { CardPicker } from '../physical/CardPicker';
import { Sheet } from '../ui/Sheet';
import { t } from '../../i18n';
import { chips, net } from '../../lib/format';
import type { TableModel } from '../../lib/model';
import { act, send } from '../../lib/socket';
import { useGame } from '../../store/game';
import { useMediaQuery, useServerNow } from '../../lib/useNow';
import { SeatFloat } from '../chat/SeatFloat';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { CardFace, CardSlot, Fan, FlipCard } from '../ui/PlayingCard';

export function YourHand({
  m,
  wide,
  onRankings,
}: {
  m: TableModel;
  wide: boolean;
  onRankings: () => void;
}) {
  const r = m.round;
  const me = m.me;
  const rp = m.rpOf(m.meId);
  const narrow = useMediaQuery('(max-width: 379px)');
  if (!me) return null;

  const myTurn = m.waitingOn === m.meId;
  const canSee =
    !!rp && !rp.seen && !rp.packed && !!r && r.phase !== 'DEALING' && r.phase !== 'ENDED';
  const amount = m.openTab ? m.netOf(me) : me.balance;
  const amountText = m.openTab ? net(amount) : chips(amount);
  const amountColor = m.openTab
    ? amount > 0
      ? 'text-up'
      : amount < 0
        ? 'text-down'
        : 'text-ink-300'
    : 'text-ink-100';
  const hand = m.priv?.hand ?? null;
  const size = wide || narrow ? 'md' : 'lg';
  const seenOthers = Object.entries(m.priv?.visibleHands ?? {});
  const away = !!m.pub.table.players.find((p) => p.id === m.meId)?.away;

  const see = () => void act('action:see', {});

  return (
    <div className="relative flex flex-col items-center">
      {myTurn && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-12 z-10 flex h-10 items-center gap-2.5 rounded-full bg-gold-400 pl-4 pr-2 text-gold-ink shadow-[0_0_0_4px_rgba(236,198,106,0.25),0_0_28px_6px_rgba(236,198,106,0.45)]"
          role="status"
        >
          <span className="whitespace-nowrap font-display text-[15px] font-bold tracking-[0.06em]">
            {t.table.yourTurn.toUpperCase()}
          </span>
          <TurnClock m={m} />
        </motion.div>
      )}

      <div className="grid w-full grid-cols-[64px_1fr_64px] items-center gap-2 px-2.5">
        <div className="flex flex-col items-center gap-1">
          <span className="relative">
            <Avatar
              id={me.id}
              name={me.name}
              avatar={me.avatar}
              size={40}
              ring={myTurn ? 'you' : null}
            />
            <SeatFloat playerId={me.id} />
          </span>
          <span className={`tabular font-display text-[15px] font-bold ${amountColor}`}>
            {amountText}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          {away && (!rp || r?.phase === 'ENDED') ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span className="text-sm text-ink-300">{t.table.youAreAway}</span>
              <button
                type="button"
                onClick={() => void act('game:away', { away: false })}
                className="flex min-h-[44px] items-center gap-2 rounded-xl bg-ink-100 px-4 text-sm font-bold text-felt-950"
              >
                <Icon name="play" size={16} />
                {t.table.imBack}
              </button>
            </div>
          ) : !r || (r.phase === 'ENDED' && !rp) ? (
            <span className="py-6 text-center text-sm text-ink-300">
              {t.table.waitingNextRound}
            </span>
          ) : !rp ? (
            <span className="py-6 text-center text-sm text-ink-300">{t.table.nextRound}</span>
          ) : m.mode === 'digital' ? (
            <div className="relative">
              {myTurn && (
                <div className="pointer-events-none absolute -inset-6 rounded-[50%] bg-[radial-gradient(ellipse,rgba(236,198,106,0.26)_0%,rgba(236,198,106,0)_70%)]" />
              )}
              <div className={rp.packed && !hand ? 'opacity-50' : ''}>
                <Fan overlap={wide ? 14 : 18}>
                  {[0, 1, 2].map((i) => (
                    <FlipCard key={i} card={hand?.[i] ?? null} size={size} />
                  ))}
                </Fan>
              </div>
              {canSee && (
                <button
                  type="button"
                  onClick={see}
                  className="absolute inset-0 z-20 flex items-center justify-center"
                  aria-label={t.table.seeCards}
                >
                  <span className="flex h-9 items-center gap-1.5 rounded-full bg-ink-100 px-3.5 text-sm font-bold text-felt-950 shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
                    <Icon name="eye" size={16} strokeWidth={2.4} />
                    {t.table.tapToSee}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <PhysicalHand m={m} canSee={canSee} onSee={see} />
          )}
          {m.handName && m.mode === 'digital' && (
            <span className="flex h-[26px] items-center whitespace-nowrap rounded-full bg-felt-950/85 px-3 text-[13px] font-bold shadow-[inset_0_0_0_1px_rgba(244,241,234,0.3)]">
              {m.handName}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onRankings}
          className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl bg-ink-100/[0.08] text-xs font-semibold"
        >
          <Icon name="ranks" size={22} />
          {t.table.ranks}
        </button>
      </div>

      {seenOthers.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 px-3">
          {seenOthers.map(([id, cards]) => (
            <span
              key={id}
              className="flex items-center gap-2 rounded-xl bg-ink-100/[0.06] px-2.5 py-1.5 text-xs text-ink-300"
            >
              {t.table.youSaw(m.nameOf(id))}
              <span className="flex gap-0.5">
                {cards.map((c) => (
                  <CardFace key={c} card={c} size="xs" />
                ))}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Physical cards: "I've looked" plus the optional, private "Enter my hand". */
function PhysicalHand({ m, canSee, onSee }: { m: TableModel; canSee: boolean; onSee: () => void }) {
  const [entering, setEntering] = useState(false);
  const r = m.round!;
  const rp = m.rpOf(m.meId)!;
  const hand = rp.entered ? (m.priv?.hand ?? null) : null;
  const canEnter =
    (r.phase === 'BETTING' || r.phase === 'AWAITING_SIDESHOW_RESPONSE') &&
    !rp.packed &&
    !rp.handLocked;
  const closeOnPhase = r.phase !== 'BETTING' && r.phase !== 'AWAITING_SIDESHOW_RESPONSE';

  return (
    <div className="flex flex-col items-center gap-2">
      {hand ? (
        <Fan overlap={18} tilt={8}>
          {hand.map((c) => (
            <CardFace key={c} card={c} size="sm" />
          ))}
        </Fan>
      ) : (
        <Fan overlap={22} tilt={8}>
          {[0, 1, 2].map((i) => (
            <CardSlot key={i} size="sm" />
          ))}
        </Fan>
      )}
      {hand ? (
        // One row: hand name + Edit (keeps the hand area as short as before on small phones).
        <div className="flex items-center justify-center gap-2">
          {m.handName && (
            <span className="flex h-[30px] items-center whitespace-nowrap rounded-full bg-felt-950/85 px-3 text-[13px] font-bold shadow-[inset_0_0_0_1px_rgba(244,241,234,0.3)]">
              {m.handName}
            </span>
          )}
          {canEnter ? (
            <button
              type="button"
              onClick={() => setEntering(true)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-ink-300 active:bg-white/5"
            >
              <Icon name="grid" size={15} />
              {t.physical.editHand}
            </button>
          ) : (
            rp.handLocked && <span className="text-xs text-ink-300">{t.physical.lockedNote}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {canSee ? (
            <button
              type="button"
              onClick={onSee}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-ink-100 px-4 text-sm font-bold text-felt-950"
            >
              <Icon name="eye" size={16} strokeWidth={2.4} />
              {t.table.lookedPhysical}
            </button>
          ) : (
            rp.seen &&
            !hand && (
              <span className="flex min-h-[36px] items-center gap-2 rounded-xl px-3 text-sm font-semibold shadow-[inset_0_0_0_1.5px_rgba(244,241,234,0.4)]">
                <Icon name="check" size={16} strokeWidth={2.6} />
                {t.table.lookedDone}
              </span>
            )
          )}
          {canEnter && (
            <button
              type="button"
              onClick={() => setEntering(true)}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-panel px-3.5 text-sm font-semibold"
            >
              <Icon name="grid" size={16} />
              {t.physical.enterHand}
            </button>
          )}
        </div>
      )}
      <Sheet
        open={entering && !closeOnPhase}
        onClose={() => setEntering(false)}
        title={t.physical.enterHandTitle}
        tall
      >
        <CardPicker
          key={hand?.join() ?? 'new'}
          taken={[]}
          initial={hand ?? []}
          a23Rank={r.rules.a23Rank}
          intro={
            hand
              ? `${t.physical.enterHandBody} ${t.physical.editableNote}`
              : t.physical.enterHandBody
          }
          submitLabel={t.physical.saveHand}
          onSubmit={(cards) =>
            void send('action:enterHand', { cards: cards as [Card, Card, Card] }).then((ack) => {
              if (ack.ok) setEntering(false);
              else useGame.getState().pushError(ack.error.message);
            })
          }
        />
      </Sheet>
    </div>
  );
}

function TurnClock({ m }: { m: TableModel }) {
  const now = useServerNow(500);
  const timer = m.pub.timer;
  if (!timer || timer.playerId !== m.meId || timer.kind !== 'turn') {
    return <span className="w-1" />;
  }
  const left = Math.max(0, timer.deadline - now);
  const frac = Math.min(1, left / timer.durationMs);
  const c = 2 * Math.PI * 13;
  return (
    <span className="relative flex h-[30px] w-[30px] items-center justify-center text-xs font-bold tabular">
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        aria-hidden="true"
        className="absolute inset-0"
      >
        <circle cx="15" cy="15" r="13" fill="none" stroke="rgba(26,18,6,0.2)" strokeWidth="3" />
        <circle
          cx="15"
          cy="15"
          r="13"
          fill="none"
          stroke="#1A1206"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 15 15)"
        />
      </svg>
      {Math.ceil(left / 1000)}
    </span>
  );
}
