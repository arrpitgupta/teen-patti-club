import type { GameResults, JoinResult } from '@tpc/shared';
import { toPng } from 'html-to-image';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { amountText, ResultsCard } from '../components/results/ResultsCard';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { t } from '../i18n';
import { resultsUrl } from '../lib/config';
import { net } from '../lib/format';
import type { TableModel } from '../lib/model';
import { act } from '../lib/socket';
import { LOCAL_CODE } from '../practice/localGame';
import { getSeat, rememberGroup, saveSeat } from '../lib/storage';
import { useGame } from '../store/game';

export function summaryText(
  code: string,
  res: GameResults,
  nameOf: (id: string) => string,
  link: string | null = null,
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
  if (link) lines.push('', t.results.linkLine(link));
  lines.push('', t.virtualOnly);
  return lines.join('\n');
}

/** The permanent read-only results page, plus the group page for group games. */
function ResultsLink({ m }: { m: TableModel }) {
  const [copied, setCopied] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  if (m.pub.code === LOCAL_CODE) return null;
  const url = resultsUrl(m.pub.resultsId);
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-panel p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold">{t.results.link}</h2>
        <p className="text-[13px] text-ink-300">{t.results.linkHint}</p>
      </div>
      <a
        href={url}
        className="break-all rounded-xl bg-black/25 px-3 py-2.5 text-[13px] text-ink-100 underline decoration-ink-500 underline-offset-2"
      >
        {url.replace(/^https?:\/\//, '')}
      </a>
      <Button
        icon={copied ? 'check' : 'copy'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            pushToast(t.errors.generic, 'error');
          }
        }}
      >
        {copied ? t.common.copied : t.results.copyLink}
      </Button>
      {m.pub.group && (
        <Link
          to={`/group/${m.pub.group.id}`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-ink-100/[0.06] text-[15px] font-semibold"
        >
          <Icon name="users" size={18} />
          {t.results.openGroup(m.pub.group.name)}
        </Link>
      )}
    </section>
  );
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
  const group = m.pub.group;
  useEffect(() => {
    if (group?.name) rememberGroup(group.id, group.name);
  }, [group?.id, group?.name]);
  if (!res) return null;
  const nameOf = (id: string) => res.rankings.find((r) => r.playerId === id)?.name ?? m.nameOf(id);
  const link = m.pub.code === LOCAL_CODE ? null : resultsUrl(m.pub.resultsId);
  const text = summaryText(m.pub.code, res, nameOf, link);

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
        <ResultsCard ref={card} eyebrow={m.pub.code} res={res} nameOf={nameOf} />

        <ResultsLink m={m} />

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
