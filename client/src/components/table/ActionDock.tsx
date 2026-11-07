import { NUDGE_AFTER_MS, NUDGE_COOLDOWN_MS, type ClientEventName } from '@tpc/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { chips } from '../../lib/format';
import { joinNames, type TableModel } from '../../lib/model';
import { act } from '../../lib/socket';
import { getPrefs } from '../../lib/storage';
import { useServerNow } from '../../lib/useNow';
import { Icon } from '../ui/Icon';
import { BetSheet } from './BetSheet';
import { DealPanel } from './DealPanel';
import { RoundRecap } from './RoundRecap';
import { SideShowPrompt } from './SideShowPrompt';

const PACK_DELAY_MS = 3000;
type InfoKey = keyof typeof t.actions.info;

/** The plain-English line above the buttons, built from engine values only. */
export function turnHint(m: TableModel): string | null {
  const L = m.legal;
  const rp = m.rpOf(m.actorId);
  if (!L.isTurn || !rp || !m.round) return null;
  if (L.mustSee) return t.hints.mustSee;
  if (L.betBlocked === 'INSUFFICIENT_CHIPS') return t.hints.broke;
  if (!L.bet) return null;
  if (L.bet.min === L.bet.max) return t.hints.exact(L.bet.min);
  if (!rp.seen && m.seenRange)
    return t.hints.blind(L.bet.min, L.bet.max, m.seenRange.min, m.seenRange.max);
  return t.hints.seen(m.round.stake, L.bet.min, L.bet.max);
}

export function ActionDock({ m, wide }: { m: TableModel; wide: boolean }) {
  const r = m.round;
  const L = m.legal;
  const [betOpen, setBetOpen] = useState(false);
  const [packingUntil, setPackingUntil] = useState<number | null>(null);
  const [info, setInfo] = useState<InfoKey | null>(null);
  const actAs = m.actingForOther ? { actAs: m.actorId } : {};

  const send = (name: ClientEventName, payload: Record<string, unknown> = {}) =>
    void act(name, { ...payload, ...actAs } as never);

  // Pack is protected by a 3 s local undo: nothing is sent until it runs out.
  const packActor = useRef<string | null>(null);
  useEffect(() => {
    if (packingUntil === null) return;
    if (!L.isTurn || packActor.current !== m.actorId) {
      setPackingUntil(null);
      return;
    }
    const id = setTimeout(
      () => {
        setPackingUntil(null);
        send('action:pack');
      },
      Math.max(0, packingUntil - Date.now()),
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packingUntil, L.isTurn, m.actorId]);

  const startPack = () => {
    packActor.current = m.actorId;
    setPackingUntil(Date.now() + PACK_DELAY_MS);
  };

  if (!r || m.pub.status !== 'active') return <Dock>{null}</Dock>;

  if (m.pub.paused) {
    return (
      <Dock>
        <p className="flex items-center gap-2 py-2 text-[15px] font-semibold">
          <Icon name="pause" size={18} />
          {t.table.paused}
        </p>
      </Dock>
    );
  }

  if (r.phase === 'DEALING') return <DealPanel m={m} />;
  if (r.phase === 'ENDED') return <RoundRecap m={m} />;

  const sideShowSheet = <SideShowPrompt m={m} />;

  if (!L.isTurn) {
    const waitingName = m.waitingOn ? m.nameOf(m.waitingOn) : null;
    const text =
      r.phase === 'AWAITING_SIDESHOW_RESPONSE' && r.pendingSideShow
        ? t.sideShow.waitingAnswer(m.nameOf(r.pendingSideShow.targetId))
        : r.phase === 'AWAITING_RESULT'
          ? t.table.comparing(joinNames((r.comparison?.playerIds ?? []).map(m.nameOf)))
          : waitingName
            ? t.table.turnOf(waitingName)
            : t.table.notYourTurn;
    const mine = m.rpOf(m.meId);
    const canSee = !!mine && !mine.seen && !mine.packed && m.mode === 'digital';
    return (
      <Dock>
        {sideShowSheet}
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <p className="text-[13px] text-ink-300">{text}</p>
          <NudgeButton m={m} />
        </div>
        {canSee && (
          <button
            type="button"
            onClick={() => void act('action:see', {})}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-panel text-[15px] font-semibold"
          >
            <Icon name="eye" size={18} strokeWidth={2.2} />
            {t.table.seeMyCards}
          </button>
        )}
      </Dock>
    );
  }

  const rp = m.rpOf(m.actorId)!;
  const hint = getPrefs().hints ? turnHint(m) : null;
  const blind = !rp.seen;

  if (packingUntil !== null) {
    return (
      <Dock turn>
        <PackingToast until={packingUntil} onUndo={() => setPackingUntil(null)} />
      </Dock>
    );
  }

  return (
    <Dock turn>
      {m.actingForOther && (
        <p className="text-[13px] font-semibold text-gold-400">
          {t.table.playingFor(m.nameOf(m.actorId))}
        </p>
      )}
      {hint && (
        <div className="flex items-start gap-2.5 rounded-xl bg-ink-100/[0.06] px-2.5 py-2">
          <Icon name="info" size={18} className="mt-px shrink-0 text-ink-300" />
          <p className="text-[13px] leading-snug text-ink-300">{hint}</p>
        </div>
      )}
      <div className={`flex gap-2 ${wide ? '' : ''}`}>
        <Hold info="pack" onInfo={setInfo}>
          <button
            type="button"
            onClick={startPack}
            className="h-[60px] w-[84px] rounded-[14px] bg-panel-raised text-base font-semibold"
          >
            {t.actions.pack}
          </button>
        </Hold>
        <Hold info="chaal" onInfo={setInfo} grow>
          <button
            type="button"
            disabled={!L.bet}
            onClick={() => L.bet && send('action:chaal', { amount: L.bet.min })}
            className="flex h-[60px] w-full flex-col items-center justify-center rounded-[14px] bg-gold-500 text-gold-ink shadow-[0_6px_18px_rgba(217,169,63,0.35)] disabled:bg-panel-sunk disabled:text-ink-500 disabled:shadow-none"
          >
            <span className="text-xs font-bold tracking-[0.06em]">
              {(blind ? t.actions.chaalBlind : t.actions.chaal).toUpperCase()}
            </span>
            <span className="tabular font-display text-[22px] font-bold leading-tight">
              {L.bet ? chips(L.bet.min) : '—'}
            </span>
          </button>
        </Hold>
        {L.bet && L.bet.max > L.bet.min && (
          <Hold info="double" onInfo={setInfo}>
            <button
              type="button"
              onClick={() => L.bet && send('action:chaal', { amount: L.bet.max })}
              className="flex h-[60px] w-[96px] flex-col items-center justify-center rounded-[14px] text-gold-400 shadow-[inset_0_0_0_2px_#D9A93F]"
            >
              <span className="text-xs font-bold tracking-[0.06em]">
                {t.actions.double.toUpperCase()}
              </span>
              <span className="tabular font-display text-xl font-bold leading-tight">
                {chips(L.bet.max)}
              </span>
            </button>
          </Hold>
        )}
      </div>
      <div className="flex gap-2">
        {blind && L.canSee ? (
          <button
            type="button"
            onClick={() => send('action:see')}
            className="flex h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-panel text-sm font-semibold"
          >
            <Icon name="eye" size={16} strokeWidth={2.2} />
            {m.mode === 'physical' ? t.table.lookedPhysical : t.table.seeCards}
          </button>
        ) : (
          <Hold info="sideShow" onInfo={setInfo} grow>
            <button
              type="button"
              disabled={!L.sideShow}
              onClick={() => send('action:sideshowRequest')}
              className="h-[46px] w-full rounded-xl bg-panel text-sm font-semibold disabled:bg-panel-sunk disabled:text-ink-500"
            >
              {t.actions.sideShow}
              {L.sideShow && ` · ${chips(L.sideShow.cost)}`}
            </button>
          </Hold>
        )}
        <Hold info="show" onInfo={setInfo} grow>
          <button
            type="button"
            disabled={!L.show}
            onClick={() => send('action:show')}
            className="h-[46px] w-full rounded-xl bg-panel text-sm font-semibold disabled:bg-panel-sunk disabled:text-ink-500"
          >
            {t.actions.show}
            {L.show && ` · ${chips(L.show.cost)}`}
          </button>
        </Hold>
        <Hold info="custom" onInfo={setInfo}>
          <button
            type="button"
            aria-label={t.actions.custom}
            disabled={!L.bet || L.bet.min === L.bet.max}
            onClick={() => setBetOpen(true)}
            className="flex h-[46px] w-[52px] items-center justify-center rounded-xl bg-panel disabled:bg-panel-sunk disabled:text-ink-500"
          >
            <Icon name="sliders" size={20} />
          </button>
        </Hold>
      </div>

      <AnimatePresence>
        {info && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-3 -top-2 -translate-y-full rounded-2xl bg-ink-100 p-3 text-sm text-felt-950 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
            role="tooltip"
            onClick={() => setInfo(null)}
          >
            {t.actions.info[info]}
          </motion.div>
        )}
      </AnimatePresence>

      {L.bet && (
        <BetSheet
          open={betOpen}
          onClose={() => setBetOpen(false)}
          range={L.bet}
          stake={r.stake}
          onBet={(amount) => {
            setBetOpen(false);
            send('action:chaal', { amount });
          }}
        />
      )}
      {sideShowSheet}
    </Dock>
  );
}

/** Appears once the player to act has had NUDGE_AFTER_MS, at most once per cooldown. */
function NudgeButton({ m }: { m: TableModel }) {
  const now = useServerNow(1000);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const turn = m.pub.turn;
  const target = turn ? m.playerOf(turn.playerId) : undefined;
  if (!turn || !target || turn.playerId === m.meId || target.isOffline) return null;
  const last = Math.max(m.pub.lastNudgeAt ?? 0, sentAt ?? 0);
  const ready = now - turn.since >= NUDGE_AFTER_MS && now - last >= NUDGE_COOLDOWN_MS;
  if (!ready) {
    return sentAt !== null && now - sentAt < 2500 ? (
      <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-300">
        <Icon name="check" size={16} />
        {t.nudge.sent}
      </span>
    ) : null;
  }
  return (
    <button
      type="button"
      onClick={() => {
        setSentAt(now);
        void act('game:nudge', {});
      }}
      className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-panel px-3.5 text-[13px] font-semibold active:bg-panel-raised"
    >
      <Icon name="bell" size={16} />
      {t.nudge.button(target.name)}
    </button>
  );
}

function Dock({ children, turn = false }: { children: ReactNode; turn?: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ y: 0 }}
      className={`relative flex flex-col gap-2.5 rounded-t-[22px] bg-felt-900 px-3.5 pt-3 pb-safe ${turn ? 'shadow-dock' : ''}`}
    >
      {children}
    </motion.div>
  );
}

/** Long-press (or right-click) shows what a button does; a normal tap acts. */
function Hold({
  info,
  onInfo,
  grow = false,
  children,
}: {
  info: InfoKey;
  onInfo: (k: InfoKey | null) => void;
  grow?: boolean;
  children: ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div
      className={grow ? 'min-w-0 flex-1' : ''}
      onPointerDown={() => {
        fired.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onInfo(info);
          window.setTimeout(() => onInfo(null), 3500);
        }, 450);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        onInfo(info);
      }}
      onClickCapture={(e) => {
        if (fired.current) {
          e.stopPropagation();
          e.preventDefault();
          fired.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}

function PackingToast({ until, onUndo }: { until: number; onUndo: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, until - now);
  return (
    <div className="flex min-h-[112px] items-center justify-center">
      <div
        className="flex h-14 items-center gap-4 rounded-2xl bg-ink-100 pl-4 pr-2 text-felt-950 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        role="alert"
      >
        <span className="text-[15px] font-semibold">
          {t.actions.packing(Math.ceil(left / 1000))}
        </span>
        <span className="h-1 w-16 overflow-hidden rounded-full bg-felt-950/15">
          <span
            className="block h-1 bg-felt-950"
            style={{ width: `${(left / PACK_DELAY_MS) * 100}%` }}
          />
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="h-11 rounded-xl bg-felt-950 px-4 text-sm font-bold text-ink-100"
          autoFocus
        >
          {t.actions.undo}
        </button>
      </div>
    </div>
  );
}
