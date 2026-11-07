import type { PublicComparison } from '@tpc/shared';
import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { chips } from '../../lib/format';
import { canHostActFor, joinNames, type TableModel } from '../../lib/model';
import { act } from '../../lib/socket';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { CardPicker } from './CardPicker';

function needsInput(c: PublicComparison, id: string): boolean {
  if (c.method === 'tapWinner') return !c.proposal || !c.proposal.confirmedBy.includes(id);
  if (c.method === 'enterCards') return !c.enteredBy.includes(id);
  return false;
}

/**
 * Physical mode: settles a side show, show or pot-limit show.
 * Only the player who picks the winner gets to choose; everyone else confirms or disputes.
 */
export function ComparisonSheet({ m }: { m: TableModel }) {
  const r = m.round;
  const c = r?.phase === 'AWAITING_RESULT' ? r.comparison : null;
  if (!r || !c || c.method === 'auto') return null;

  // Seats this phone answers for: yourself, and (host) offline or disconnected players.
  const mine = c.playerIds.filter((id) => id === m.meId || (m.isHost && canHostActFor(m.pub, id)));
  if (mine.length === 0) return null;
  const actor = mine.find((id) => needsInput(c, id)) ?? mine[0]!;
  const actAs: Record<string, string> = actor !== m.meId ? { actAs: actor } : {};
  const reason =
    c.reason === 'sideshow'
      ? t.physical.reasonSideShow
      : c.reason === 'show'
        ? t.physical.reasonShow
        : t.physical.reasonPotLimit;
  const eyebrow = (
    <>
      {actor !== m.meId ? `${t.physical.answeringFor(m.nameOf(actor))} · ` : ''}
      {reason} · {t.table.pot} <span className="text-gold-300">{chips(r.pot)}</span>
    </>
  );

  let body;
  if (c.method === 'tapWinner') {
    if (!c.proposal) body = <PickWinners m={m} c={c} actor={actor} actAs={actAs} />;
    else if (c.proposal.confirmedBy.includes(actor))
      body = <ConfirmStatus m={m} c={c} actor={actor} />;
    else body = <ConfirmResult m={m} c={c} actor={actor} actAs={actAs} />;
  } else if (c.enteredBy.includes(actor)) {
    const missing = c.playerIds.filter((id) => !c.enteredBy.includes(id)).map(m.nameOf);
    body = (
      <p className="flex items-center gap-2 text-[15px] text-ink-300">
        <Icon name="clock" size={18} />
        {t.physical.waitingCards(joinNames(missing))}
      </p>
    );
  } else {
    body = (
      <CardPicker
        taken={actor === m.meId ? (m.priv?.takenCards ?? []) : []}
        a23Rank={r.rules.a23Rank}
        onSubmit={(cards) => void act('result:enterCards', { cards, ...actAs } as never)}
      />
    );
  }

  return (
    <Sheet open dismissible={false} tall eyebrow={eyebrow} title={titleFor(m, c, actor)}>
      {body}
    </Sheet>
  );
}

function titleFor(m: TableModel, c: PublicComparison, actor: string): string {
  if (c.method === 'enterCards') return t.physical.pickCards;
  if (!c.proposal) return c.reason === 'potLimit' ? t.physical.potLimitTitle : t.physical.whoWon;
  const picker = m.nameOf(c.proposal.by);
  const tie = c.proposal.winnerIds.length === c.playerIds.length && c.playerIds.length === 2;
  if (c.proposal.by === actor) return t.physical.whoWon;
  if (tie) return t.physical.saysTie(picker);
  const winners = c.proposal.winnerIds;
  if (winners.length === 1 && winners[0] === actor) return t.physical.saysYouWon(picker);
  if (winners.length === 1 && winners[0] === c.proposal.by) return t.physical.saysSelfWon(picker);
  return t.physical.saysWon(picker, joinNames(winners.map(m.nameOf)));
}

function tieHint(m: TableModel, c: PublicComparison): string | null {
  if (c.playerIds.length !== 2 || !c.requesterId) return null;
  if (c.reason === 'show') {
    const other = c.playerIds.find((id) => id !== c.requesterId)!;
    return t.physical.tieGoesTo(m.nameOf(other));
  }
  return t.physical.tieRequesterPacks(m.nameOf(c.requesterId));
}

function PickWinners({
  m,
  c,
  actor,
  actAs,
}: {
  m: TableModel;
  c: PublicComparison;
  actor: string;
  actAs: Record<string, string>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const key = `${c.reason}:${c.playerIds.join()}`;
  useEffect(() => setPicked([]), [key]);
  const two = c.playerIds.length === 2;
  const others = c.playerIds.filter((id) => id !== actor).map(m.nameOf);
  const send = (winnerIds: string[]) =>
    void act('result:tapWinner', { winnerIds, ...actAs } as never);
  const toggle = (id: string) =>
    setPicked((p) => (two ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-ink-300">
        {two ? t.physical.whoWonBody(joinNames(others)) : t.physical.pickWinners}
      </p>
      {two ? (
        <div className="grid grid-cols-2 gap-3">
          {c.playerIds.map((id) => {
            const p = m.playerOf(id)!;
            const on = picked.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(id)}
                className={`relative flex h-44 flex-col items-center justify-center gap-2.5 rounded-[18px] ${on ? 'bg-ink-100/10 shadow-[inset_0_0_0_2.5px_#F4F1EA]' : 'bg-panel shadow-[inset_0_0_0_1.5px_rgba(244,241,234,0.12)]'}`}
              >
                {on && (
                  <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-felt-950">
                    <Icon name="check" size={16} strokeWidth={3} />
                  </span>
                )}
                <Avatar id={p.id} name={p.name} avatar={p.avatar} size={64} />
                <span className="font-display text-lg font-semibold">{m.nameOf(id)}</span>
                {on ? (
                  <span className="text-xs font-bold uppercase tracking-[0.08em]">
                    {t.physical.winner}
                  </span>
                ) : (
                  c.requesterId === id && (
                    <span className="text-xs text-ink-500">{t.physical.asked}</span>
                  )
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[18px] bg-panel">
          {c.playerIds.map((id, i) => {
            const p = m.playerOf(id)!;
            const on = picked.includes(id);
            return (
              <li key={id} className={i > 0 ? 'border-t border-ink-100/[0.08]' : ''}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(id)}
                  className="flex min-h-[64px] w-full items-center gap-3 px-3.5 text-left"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-ink-100 text-felt-950' : 'border-2 border-ink-100/35'}`}
                  >
                    {on && <Icon name="check" size={16} strokeWidth={3} />}
                  </span>
                  <Avatar id={p.id} name={p.name} avatar={p.avatar} size={40} />
                  <span className="flex-1 text-[15px] font-semibold">{m.nameOf(id)}</span>
                  {on && (
                    <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-bold text-felt-950">
                      {t.physical.winner}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {two && (
        <>
          <button
            type="button"
            onClick={() => send([...c.playerIds])}
            className="min-h-[52px] rounded-2xl bg-panel text-base font-semibold"
          >
            {t.physical.tie}
          </button>
          {tieHint(m, c) && (
            <p className="-mt-2 text-center text-[13px] text-ink-500">{tieHint(m, c)}</p>
          )}
        </>
      )}
      <button
        type="button"
        disabled={picked.length === 0}
        onClick={() => send(picked)}
        className="min-h-[60px] rounded-2xl bg-gold-500 font-display text-[17px] font-bold text-gold-ink disabled:bg-panel-sunk disabled:text-ink-500"
      >
        {two && picked[0] ? t.physical.sendWinner(m.nameOf(picked[0])) : t.physical.sendWinners}
      </button>
      <button
        type="button"
        onClick={() => void act('result:dispute', { ...actAs } as never)}
        className="flex min-h-[48px] items-center justify-center gap-2 text-[15px] font-semibold underline underline-offset-4"
      >
        <Icon name="grid" size={18} />
        {t.physical.enterInstead}
      </button>
    </div>
  );
}

/** Read-only: confirmers can never change the selection, only agree or dispute. */
function ConfirmResult({
  m,
  c,
  actor,
  actAs,
}: {
  m: TableModel;
  c: PublicComparison;
  actor: string;
  actAs: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-ink-300">{t.physical.checkHands}</p>
      <StatusList m={m} c={c} actor={actor} />
      <div className="flex items-start gap-2.5 rounded-2xl bg-ink-100/[0.06] p-3">
        <Icon name="info" size={18} className="mt-px shrink-0 text-ink-300" />
        <p className="text-[13px] leading-snug text-ink-300">{t.physical.disagreeHint}</p>
      </div>
      <button
        type="button"
        onClick={() => void act('result:confirm', { ...actAs } as never)}
        className="min-h-[60px] rounded-2xl bg-gold-500 font-display text-[17px] font-bold text-gold-ink"
      >
        {t.physical.yesConfirm}
      </button>
      <button
        type="button"
        onClick={() => void act('result:dispute', { ...actAs } as never)}
        className="min-h-[52px] rounded-2xl bg-panel text-base font-semibold"
      >
        {t.physical.noEnterCards}
      </button>
    </div>
  );
}

function ConfirmStatus({ m, c, actor }: { m: TableModel; c: PublicComparison; actor: string }) {
  const waiting = c.playerIds.filter((id) => !c.proposal?.confirmedBy.includes(id)).map(m.nameOf);
  return (
    <div className="flex flex-col gap-4">
      <StatusList m={m} c={c} actor={actor} />
      <p className="flex items-center gap-2 text-[15px] text-ink-300">
        <Icon name="clock" size={18} />
        {t.physical.waitingConfirm(joinNames(waiting))}
      </p>
    </div>
  );
}

function StatusList({ m, c, actor }: { m: TableModel; c: PublicComparison; actor: string }) {
  const proposal = c.proposal!;
  const confirmed = c.playerIds.filter((id) => proposal.confirmedBy.includes(id)).length;
  return (
    <>
      <ul className="flex flex-col overflow-hidden rounded-[18px] bg-panel">
        {c.playerIds.map((id, i) => {
          const p = m.playerOf(id)!;
          const winner = proposal.winnerIds.includes(id);
          const status =
            id === proposal.by
              ? t.physical.pickedWinner
              : proposal.confirmedBy.includes(id)
                ? t.physical.confirmed
                : id === actor
                  ? null
                  : t.physical.waitingDot;
          return (
            <li
              key={id}
              className={`flex min-h-[64px] items-center gap-3 px-3.5 ${i > 0 ? 'border-t border-ink-100/[0.08]' : ''} ${id === actor ? 'bg-ink-100/[0.04]' : ''}`}
            >
              <Avatar id={p.id} name={p.name} avatar={p.avatar} size={40} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{m.nameOf(id)}</span>
                {status && (
                  <span
                    className={`text-xs ${proposal.confirmedBy.includes(id) ? 'text-up' : 'text-ink-300'}`}
                  >
                    {status}
                  </span>
                )}
              </div>
              {winner && (
                <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-bold text-felt-950">
                  {t.physical.winner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {c.playerIds.length > 2 && (
        <p className="text-[13px] text-ink-300">
          <b className="text-ink-100">
            {confirmed} of {c.playerIds.length}
          </b>{' '}
          {t.physical.confirmed.toLowerCase()}
        </p>
      )}
    </>
  );
}
