import { describeHandValue, evaluateHand, explainComparison } from '@tpc/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { possessive, t } from '../../i18n';
import { chips } from '../../lib/format';
import type { TableModel } from '../../lib/model';
import { localGame } from '../../practice/localGame';
import { ASHA, DEV, STEPS, useTutorial, type StepId } from '../../practice/tutorial';
import { Icon } from '../ui/Icon';

const ORDER = Object.keys(STEPS) as StepId[];

/** What the coach says right now, built from the real table state. */
function coachText(step: StepId, m: TableModel): string {
  const r = m.round;
  const L = m.legal;
  const c = (n: number | undefined) => chips(n ?? 0);
  switch (step) {
    case 'welcome':
      return t.tutorial.welcome(c(r?.rules.boot), c(r?.pot));
    case 'blindChaal':
      return t.tutorial.blindChaal(c(L.bet?.min), c(L.bet?.max));
    case 'ashaTurn':
    case 'sideShow':
      return r?.pendingSideShow?.targetId === m.meId
        ? t.tutorial.sideShow
        : t.tutorial.thinking(m.nameOf(ASHA));
    case 'rohitTurn':
      return t.tutorial.thinking('Rohit');
    case 'devTurn':
    case 'devSees':
      return t.tutorial.thinking(m.nameOf(DEV));
    case 'ashaSaw': {
      const bet = [...m.pub.log]
        .reverse()
        .find((e) => e.event.type === 'BET' && e.event.playerId === ASHA)?.event;
      const amount = bet?.type === 'BET' ? bet.amount : 0;
      return t.tutorial.ashaSaw(c(amount), c(r?.stake));
    }
    case 'rohitPacked':
      return t.tutorial.rohitPacked;
    case 'see':
      return t.tutorial.see;
    case 'handName':
      return t.tutorial.handName(m.handName ?? '');
    case 'double':
      return t.tutorial.double(c(L.bet?.min), c(L.bet?.max));
    case 'sideShowResult': {
      const mine = m.priv?.hand;
      const hers = m.priv?.visibleHands[ASHA];
      if (!mine || !hers || !r) return t.tutorial.rohitPacked;
      const a = evaluateHand(mine, { a23Rank: r.rules.a23Rank });
      const b = evaluateHand(hers, { a23Rank: r.rules.a23Rank });
      return t.tutorial.sideShowResult(
        t.recap.because(
          possessive(t.common.you),
          describeHandValue(a),
          possessive(m.nameOf(ASHA)),
          describeHandValue(b),
          explainComparison(a, b),
        ),
      );
    }
    case 'show':
      return t.tutorial.show(c(L.show?.cost));
    case 'won':
      return t.tutorial.won(c(r?.result?.pot));
  }
}

/** The coach bubble that walks the player through the tutorial round. */
export function TutorialCoach({ m }: { m: TableModel }) {
  const step = useTutorial((s) => s.step);
  const go = useTutorial((s) => s.go);
  const navigate = useNavigate();
  const def = STEPS[step];
  const index = ORDER.indexOf(step) + 1;

  const next = () => {
    if (!def.next) return;
    go(def.next);
    localGame()?.refresh(); // bots may act in the next step
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+56px)] z-[45] flex justify-center px-3">
      <AnimatePresence mode="wait">
        <motion.section
          key={step}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl bg-ink-100 p-3.5 text-felt-950 shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
          role="status"
          aria-live="polite"
          aria-label={t.tutorial.coach}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-felt-800">
              <Icon name="info" size={14} strokeWidth={2.4} />
              {t.tutorial.coach} · {t.tutorial.step(index, ORDER.length)}
            </span>
            {step !== 'won' && (
              <button
                type="button"
                onClick={() => navigate('/learn')}
                className="-my-2 min-h-[44px] px-2 text-[13px] font-semibold text-felt-800 underline underline-offset-2"
              >
                {t.tutorial.skip}
              </button>
            )}
          </div>
          <p className="text-[15px] font-semibold leading-snug">{coachText(step, m)}</p>
          {def.next && (
            <button
              type="button"
              onClick={next}
              className="flex min-h-[44px] items-center justify-center gap-1.5 self-end rounded-xl bg-felt-950 px-4 text-sm font-bold text-ink-100"
            >
              {t.tutorial.next}
              <Icon name="arrowRight" size={16} />
            </button>
          )}
          {step === 'won' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate('/learn')}
                className="min-h-[44px] rounded-xl text-sm font-bold shadow-[inset_0_0_0_1.5px_#04140D]"
              >
                {t.tutorial.done}
              </button>
              <button
                type="button"
                onClick={() => navigate('/practice')}
                className="min-h-[44px] rounded-xl bg-felt-950 text-sm font-bold text-ink-100"
              >
                {t.tutorial.practice}
              </button>
            </div>
          )}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
