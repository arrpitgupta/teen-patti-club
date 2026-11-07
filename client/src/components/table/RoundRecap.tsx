import { describeHand, describeHandValue, evaluateHand, type Card } from '@tpc/shared';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { possessive, t } from '../../i18n';
import { net } from '../../lib/format';
import { joinNames, type TableModel } from '../../lib/model';
import { act, actOk } from '../../lib/socket';
import { CardPicker } from '../physical/CardPicker';
import { Icon } from '../ui/Icon';
import { CardFace } from '../ui/PlayingCard';
import { Sheet } from '../ui/Sheet';

/** Hands shown voluntarily after the round, and the "Show my cards" button. */
function ShownHands({ m }: { m: TableModel }) {
  const [picking, setPicking] = useState(false);
  const r = m.round!;
  const res = r.result!;
  const shown = Object.entries(r.shownHands) as [string, Card[]][];
  const mine = r.players.find((p) => p.id === m.meId);
  const canShow =
    !!mine &&
    res.reason !== 'cancelled' &&
    !res.revealedHands[m.meId] &&
    !r.shownHands[m.meId] &&
    (m.mode === 'physical' || !!m.priv?.hand);
  // Physical without an entered hand: say which cards you're turning over.
  const needsPick = m.mode === 'physical' && !mine?.entered;

  if (shown.length === 0 && !canShow) return null;
  return (
    <div className="flex flex-col gap-2">
      {shown.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
            {t.recap.shown}
          </span>
          <div className="flex flex-wrap gap-4">
            {shown.map(([id, cards]) => (
              <div key={id} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-300">
                  {m.nameOf(id)} · {describeHand(cards, { a23Rank: r.rules.a23Rank })}
                </span>
                <span className="flex gap-1">
                  {cards.map((c) => (
                    <CardFace key={c} card={c} size="xs" />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {canShow && (
        <button
          type="button"
          onClick={() => (needsPick ? setPicking(true) : void act('round:showCards', {}))}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-panel text-[15px] font-semibold"
          title={t.recap.showMyCardsHint}
        >
          <Icon name="eye" size={18} />
          {t.recap.showMyCards}
        </button>
      )}
      <Sheet open={picking} onClose={() => setPicking(false)} title={t.recap.showWhichCards} tall>
        <CardPicker
          taken={[]}
          a23Rank={r.rules.a23Rank}
          intro={t.recap.showWhichCardsBody}
          submitLabel={t.recap.showThese}
          onSubmit={(cards) =>
            void actOk('round:showCards', { cards: cards as [Card, Card, Card] }).then((ok) => {
              if (ok) setPicking(false);
            })
          }
        />
      </Sheet>
    </div>
  );
}

/** After a round: who won, with what, and why (always from the evaluator). */
export function RoundRecap({ m }: { m: TableModel }) {
  const r = m.round!;
  const res = r.result;
  if (!res) return null;
  const a23Rank = r.rules.a23Rank;
  const winners = res.winnerIds;
  const hands = Object.entries(res.revealedHands) as [string, Card[]][];

  let headline: string;
  if (res.reason === 'cancelled') headline = t.recap.cancelled;
  else if (winners.length > 1) headline = t.recap.split(joinNames(winners.map(m.nameOf)), res.pot);
  else if (winners[0] === m.meId) headline = t.recap.youWon(res.pot);
  else headline = t.recap.wonPot(m.nameOf(winners[0] ?? ''), res.pot);

  let detail: string | null = null;
  if (res.reason === 'allPacked') detail = t.recap.allPacked;
  else if (res.resolution === 'tapWinner') detail = t.recap.confirmedByPlayers;
  else if (res.explanation && hands.length === 2 && winners[0]) {
    const w = winners[0];
    const loser = hands.find(([id]) => id !== w);
    const wHand = hands.find(([id]) => id === w);
    if (loser && wHand) {
      detail = res.explanation.startsWith('the hands are equal')
        ? t.recap.tieShow(m.nameOf(w), res.explanation)
        : t.recap.because(
            possessive(m.nameOf(w)),
            describeHandValue(evaluateHand(wHand[1], { a23Rank })),
            possessive(m.nameOf(loser[0])),
            describeHandValue(evaluateHand(loser[1], { a23Rank })),
            res.explanation,
          );
    }
  } else if (res.explanation)
    detail = `${res.explanation[0]?.toUpperCase()}${res.explanation.slice(1)}.`;

  // Pot-limit (3+ hands): ranked list.
  const ranked =
    hands.length > 2
      ? hands
          .map(([id, cards]) => {
            const v = evaluateHand(cards, { a23Rank });
            const rp = r.players.find((p) => p.id === id);
            const delta = (res.payouts[id] ?? 0) - (rp?.contributed ?? 0);
            return { id, cards, v, delta, winner: winners.includes(id) };
          })
          .sort((a, b) => b.v.score - a.v.score)
      : null;

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-felt-900 px-3.5 pt-3 pb-safe"
    >
      <div className="flex flex-col gap-1">
        {res.reason === 'potLimit' && (
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
            {t.recap.potLimitTitle}
          </span>
        )}
        <h2 className="font-display text-[22px] font-bold leading-tight">{headline}</h2>
        {detail && <p className="text-[14px] leading-snug text-ink-300">{detail}</p>}
      </div>

      {ranked ? (
        <ol className="flex flex-col gap-2">
          {ranked.map((row, i) => (
            <li
              key={row.id}
              className={`flex items-center gap-3 rounded-2xl p-3 ${row.winner ? 'bg-ink-100/10 shadow-[inset_0_0_0_2px_#F4F1EA]' : 'bg-panel'}`}
            >
              <span className="w-5 text-center font-display font-bold">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold">{m.nameOf(row.id)}</span>
                  <span
                    className={`tabular font-display text-sm font-semibold ${row.delta >= 0 ? 'text-up' : 'text-down'}`}
                  >
                    {net(row.delta)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex gap-0.5">
                    {row.cards.map((c) => (
                      <CardFace key={c} card={c} size="xs" />
                    ))}
                  </span>
                  <span className="truncate text-[13px] text-ink-300">
                    {describeHandValue(row.v)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        hands.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {hands.map(([id, cards]) => (
              <div key={id} className="flex flex-col gap-1">
                <span
                  className={`text-xs font-semibold ${winners.includes(id) ? 'text-ink-100' : 'text-ink-300'}`}
                >
                  {m.nameOf(id)}
                  {winners.includes(id) && ' ✓'}
                </span>
                <span className="flex gap-1">
                  {cards.map((c) => (
                    <CardFace key={c} card={c} size="xs" />
                  ))}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      <ShownHands m={m} />

      {m.isHost ? (
        <button
          type="button"
          onClick={() => void act('round:start', {})}
          className="min-h-[56px] rounded-2xl bg-ink-100 font-display text-base font-bold text-felt-950"
        >
          {t.recap.nextRound}
        </button>
      ) : (
        <p className="pb-1 text-center text-[13px] text-ink-500">{t.table.waitingNextRound}</p>
      )}
    </motion.div>
  );
}
