import type { GameResults, JoinResult } from '@tpc/shared';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { t } from '../i18n';
import { chips, net, rupees } from '../lib/format';
import type { TableModel } from '../lib/model';
import { act } from '../lib/socket';
import { LOCAL_CODE } from '../practice/localGame';
import { getSeat, saveSeat } from '../lib/storage';
import { useGame } from '../store/game';

function amountText(n: number, rate: number | null): string {
  const r = rupees(n, rate);
  return r
    ? `${chips(Math.abs(n))} ${t.common.chips} (${r})`
    : `${chips(Math.abs(n))} ${t.common.chips}`;
}

export function summaryText(
  code: string,
  res: GameResults,
  nameOf: (id: string) => string,
): string {
  const lines = [t.results.summaryTitle(code), ''];
  res.rankings.forEach((r, i) => lines.push(`${i + 1}. ${r.name}  ${net(r.net)}`));
  lines.push('', `${t.results.settle}:`);
  if (res.payments.length === 0) lines.push(t.results.settleNone);
  for (const p of res.payments) {
    lines.push(
      `• ${t.results.pays(nameOf(p.from), nameOf(p.to), amountText(p.amount, res.chipRate))}`,
    );
  }
  lines.push('', t.virtualOnly);
  return lines.join('\n');
}

/** One tap: create the rematch (first player) or join the one someone else started. */
function Rematch({ m }: { m: TableModel }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const next = m.pub.rematchCode;
  const starter = [...m.pub.log].reverse().find((e) => e.event.type === 'REMATCH_CREATED')
    ?.event as { type: 'REMATCH_CREATED'; playerId: string } | undefined;
  const alreadyIn = next ? getSeat(next) : undefined;
  const isMe = m.me && !m.me.isOffline;
  if (!isMe) return null;
  if (m.pub.code === LOCAL_CODE) {
    // Practice: start a fresh local game instead of a server rematch.
    return (
      <section className="flex flex-col gap-2 rounded-3xl bg-panel p-4">
        <Button
          variant="ivory"
          size="lg"
          icon="repeat"
          block
          onClick={() => window.location.reload()}
        >
          {t.practice.playAgain}
        </Button>
        <Button block onClick={() => navigate('/learn')}>
          {t.practice.backToLearn}
        </Button>
      </section>
    );
  }

  const go = async () => {
    if (alreadyIn) return navigate(`/g/${alreadyIn.code}`);
    setBusy(true);
    const res = await act<'game:rematch', JoinResult>('game:rematch', {});
    setBusy(false);
    if (!res) return;
    saveSeat({ ...res, joinedAt: Date.now() });
    navigate(`/g/${res.code}`);
  };

  return (
    <section className="flex flex-col gap-2 rounded-3xl bg-panel p-4">
      <p className="text-[15px] text-ink-300">
        {next && starter
          ? t.results.rematchReady(m.nameOf(starter.playerId))
          : t.results.rematchHint}
      </p>
      <Button
        variant="ivory"
        size="lg"
        icon="repeat"
        block
        disabled={busy}
        onClick={() => void go()}
      >
        {alreadyIn ? t.results.backToRematch : next ? t.results.joinRematch : t.results.rematch}
      </Button>
    </section>
  );
}

export default function Results({ m }: { m: TableModel }) {
  const res = m.pub.results;
  const card = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  // Table toasts ("Priya packed") don't belong on the results screen.
  useEffect(() => useGame.setState({ toasts: [] }), []);
  if (!res) return null;
  const nameOf = (id: string) => res.rankings.find((r) => r.playerId === id)?.name ?? m.nameOf(id);
  const text = summaryText(m.pub.code, res, nameOf);
  const podium = res.rankings.slice(0, 3);
  // Visual order 2nd, 1st, 3rd.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const heights: Record<number, number> = { 0: 112, 1: 80, 2: 60 };

  const saveImage = async () => {
    if (!card.current) return;
    try {
      const url = await toPng(card.current, { backgroundColor: '#04140D', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = url;
      a.download = `teen-patti-${m.pub.code}.png`;
      a.click();
    } catch {
      pushToast(t.errors.generic, 'error');
    }
  };

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-8">
        <div ref={card} className="flex flex-col gap-6 rounded-3xl bg-felt-950 p-1">
          <header className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
              {m.pub.code}
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
                    {t.results.pays(
                      nameOf(p.from),
                      nameOf(p.to),
                      amountText(p.amount, res.chipRate),
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-500">{t.virtualOnly}</p>
          </section>
        </div>

        <Rematch m={m} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            icon="share"
            className="col-span-2"
            size="lg"
            onClick={() =>
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
            }
          >
            {t.results.share}
          </Button>
          <Button
            icon={copied ? 'check' : 'copy'}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                pushToast(t.errors.generic, 'error');
              }
            }}
          >
            {copied ? t.common.copied : t.results.copy}
          </Button>
          <Button icon="image" onClick={() => void saveImage()}>
            {t.results.saveImage}
          </Button>
          <Link
            to="/create"
            className="flex min-h-[48px] items-center justify-center rounded-xl bg-panel text-[15px] font-semibold"
          >
            {t.results.newGame}
          </Link>
          <Link
            to="/"
            className="flex min-h-[48px] items-center justify-center rounded-xl bg-panel text-[15px] font-semibold"
          >
            {t.results.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
