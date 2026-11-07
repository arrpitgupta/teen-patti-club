import {
  applyAction,
  createTable,
  defaultSettings,
  HAND_CATEGORIES,
  legalActions,
  parseCards,
  type HandCategory,
  type TableState,
} from '@tpc/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { chips } from '../../lib/format';
import { Chip, PotStack } from '../ui/Chips';
import { Icon } from '../ui/Icon';
import { CardBack, CardFace, Fan } from '../ui/PlayingCard';
import { StatusPill } from '../ui/StatusPill';

const EXAMPLES: Record<HandCategory, string> = {
  TRAIL: 'As Ah Ad',
  PURE_SEQUENCE: '5h 6h 7h',
  SEQUENCE: 'Qs Kd Ac',
  COLOR: 'Ac Tc 4c',
  PAIR: 'Ks Kh 7d',
  HIGH_CARD: 'As Jd 9c',
};

/** Example numbers from the real engine: a 4-player round with the default rules. */
function exampleNumbers() {
  let table: TableState = createTable(defaultSettings('physical'));
  for (const id of ['a', 'b', 'c', 'd']) {
    const r = applyAction(table, { type: 'ADD_PLAYER', playerId: id });
    if (r.ok) table = r.state;
  }
  for (const a of [{ type: 'START_ROUND' }, { type: 'CARDS_DEALT' }] as const) {
    const r = applyAction(table, a);
    if (r.ok) table = r.state;
  }
  const first = table.round!.turnId!;
  const blind = legalActions(table, first).bet!;
  const seenTable = structuredClone(table);
  seenTable.round!.players.find((p) => p.id === first)!.seen = true;
  const seen = legalActions(seenTable, first).bet!;
  return {
    boot: chips(table.settings.boot),
    pot: chips(table.round!.pot),
    blind: `${chips(blind.min)}–${chips(blind.max)}`,
    seen: `${chips(seen.min)}–${chips(seen.max)}`,
  };
}

function Slide({ title, body, art }: { title: string; body: ReactNode; art: ReactNode }) {
  return (
    <div className="flex w-full shrink-0 snap-center flex-col items-center gap-6 px-6">
      <div className="felt flex h-56 w-full max-w-sm items-center justify-center rounded-[28px]">
        {art}
      </div>
      <div className="flex max-w-sm flex-col gap-2 text-center">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <p className="text-[15px] leading-relaxed text-ink-300">{body}</p>
      </div>
    </div>
  );
}

/** "How to play": 6 swipeable illustrated cards. */
export function Walkthrough({ onDone }: { onDone: () => void }) {
  const n = useMemo(exampleNumbers, []);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const w = t.walkthrough;

  const slides = [
    <Slide
      key="goal"
      title={w.goalTitle}
      body={w.goalBody}
      art={
        <div className="flex items-center gap-6">
          <Fan overlap={16} tilt={10}>
            {parseCards('Ks Kh 4d').map((c) => (
              <CardFace key={c} card={c} size="md" />
            ))}
          </Fan>
          <div className="flex flex-col items-center gap-1">
            <PotStack />
            <span className="font-display text-3xl font-bold text-gold-300">{n.pot}</span>
          </div>
        </div>
      }
    />,
    <Slide
      key="boot"
      title={w.bootTitle}
      body={w.bootBody(n.boot, n.pot)}
      art={
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex flex-col items-center gap-1">
                <Chip amount={10} size={30} />
                <span className="text-xs font-semibold">{n.boot}</span>
              </span>
            ))}
          </div>
          <Icon name="arrowRight" size={22} className="rotate-90 text-ink-300" />
          <span className="rounded-full bg-felt-950/60 px-4 py-1.5 font-display text-xl font-bold text-gold-300">
            {t.table.pot} {n.pot}
          </span>
        </div>
      }
    />,
    <Slide
      key="blind"
      title={w.blindTitle}
      body={w.blindBody(n.blind, n.seen)}
      art={
        <div className="flex items-end gap-8">
          <div className="flex flex-col items-center gap-2">
            <Fan overlap={14} tilt={8}>
              {[0, 1, 2].map((i) => (
                <CardBack key={i} size="sm" />
              ))}
            </Fan>
            <StatusPill status="blind" />
            <span className="text-xs font-semibold">{n.blind}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Fan overlap={14} tilt={8}>
              {parseCards('Qs Qd 9c').map((c) => (
                <CardFace key={c} card={c} size="sm" />
              ))}
            </Fan>
            <StatusPill status="seen" />
            <span className="text-xs font-semibold">{n.seen}</span>
          </div>
        </div>
      }
    />,
    <Slide
      key="bet"
      title={w.betTitle}
      body={w.betBody}
      art={
        <div className="flex w-[85%] gap-2">
          <span className="flex h-14 w-16 items-center justify-center rounded-xl bg-panel-raised text-sm font-semibold">
            {t.actions.pack}
          </span>
          <span className="flex h-14 flex-1 flex-col items-center justify-center rounded-xl bg-gold-500 text-gold-ink">
            <span className="text-xs font-bold">{t.actions.chaal.toUpperCase()}</span>
            <span className="font-display text-lg font-bold">{n.seen.split('–')[0]}</span>
          </span>
          <span className="flex h-14 w-20 flex-col items-center justify-center rounded-xl text-gold-400 shadow-[inset_0_0_0_2px_#D9A93F]">
            <span className="text-xs font-bold">{t.actions.double.toUpperCase()}</span>
            <span className="font-display text-lg font-bold">{n.seen.split('–')[1]}</span>
          </span>
        </div>
      }
    />,
    <Slide
      key="show"
      title={w.showTitle}
      body={w.showBody}
      art={
        <div className="flex items-center gap-4">
          <Fan overlap={14} tilt={8}>
            {parseCards('7h 8h 9h').map((c) => (
              <CardFace key={c} card={c} size="sm" />
            ))}
          </Fan>
          <span className="font-display text-lg font-bold text-ink-300">vs</span>
          <Fan overlap={14} tilt={8}>
            {parseCards('As Ad 3c').map((c) => (
              <CardFace key={c} card={c} size="sm" />
            ))}
          </Fan>
        </div>
      }
    />,
    <Slide
      key="ranks"
      title={w.ranksTitle}
      body={w.ranksBody}
      art={
        <ol className="flex flex-col gap-1">
          {[...HAND_CATEGORIES].reverse().map((cat, i) => (
            <li key={cat} className="flex items-center gap-2">
              <span className="w-4 text-right text-xs font-bold text-ink-300">{i + 1}</span>
              <span className="flex gap-0.5">
                {parseCards(EXAMPLES[cat]).map((c) => (
                  <CardFace key={c} card={c} size="xs" />
                ))}
              </span>
              <span className="text-[13px] font-semibold">{t.rankings.names[cat]![0]}</span>
            </li>
          ))}
        </ol>
      }
    />,
  ];

  // While a button-driven smooth scroll runs, the scroll position lags behind: remember the
  // target so quick taps on Next keep advancing.
  const target = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const goTo = (i: number) => {
    const el = track.current;
    target.current = i;
    setIndex(i);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => (target.current = null), 600);
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const last = index === slides.length - 1;

  return (
    <div
      className="screen fixed inset-0 z-50 justify-between py-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.learn.how}
    >
      <div className="flex justify-end px-4">
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] px-3 text-sm font-semibold text-ink-300"
        >
          {w.skip}
        </button>
      </div>
      <div
        ref={track}
        onScroll={(e) => {
          if (target.current !== null) return; // our own smooth scroll
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        aria-live="polite"
      >
        {slides}
      </div>
      <div className="flex flex-col items-center gap-4 px-6">
        <div className="flex gap-2" aria-label={w.slide(index + 1, slides.length)}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={w.slide(i + 1, slides.length)}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span
                className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-ink-100' : 'w-2 bg-ink-100/30'}`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => (last ? onDone() : goTo((target.current ?? index) + 1))}
          className="min-h-[56px] w-full max-w-sm rounded-2xl bg-ink-100 font-display text-lg font-bold text-felt-950"
        >
          {last ? w.done : w.next}
        </button>
      </div>
    </div>
  );
}
