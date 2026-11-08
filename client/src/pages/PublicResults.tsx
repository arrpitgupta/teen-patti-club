import type { Card, ResultsPage, RoundLog } from '@tpc/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ResultsCard } from '../components/results/ResultsCard';
import { Avatar } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { CardFace } from '../components/ui/PlayingCard';
import { t } from '../i18n';
import { api, loadFailed, type Load } from '../lib/api';
import { net } from '../lib/format';

const date = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function Hand({ cards }: { cards: Card[] }) {
  return (
    <span className="flex gap-1">
      {cards.map((c) => (
        <CardFace key={c} card={c} size="xs" />
      ))}
    </span>
  );
}

function RoundItem({ r, nameOf }: { r: RoundLog; nameOf: (id: string | null) => string }) {
  const winners = r.winnerIds.map(nameOf).join(' & ');
  const headline =
    r.reason === 'cancelled'
      ? t.publicResults.cancelled
      : t.publicResults.won(winners, r.winningHand);
  const revealed = Object.entries(r.revealedHands);
  const shown = Object.entries(r.shownHands).filter(([id]) => !r.revealedHands[id]);
  const moves = r.actions.filter((a) => a.type in t.publicResults.action);
  return (
    <li className="rounded-2xl bg-panel">
      <details className="group">
        <summary className="flex min-h-[64px] cursor-pointer list-none items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
              {t.publicResults.round(r.roundNumber)} · {t.publicResults.pot(r.pot)}
              {t.publicResults.reasons[r.reason] && ` · ${t.publicResults.reasons[r.reason]}`}
            </span>
            <span className="text-[15px] font-semibold">{headline}</span>
          </div>
          <Icon
            name="arrowRight"
            size={18}
            className="shrink-0 text-ink-300 transition-transform group-open:rotate-90"
          />
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {(revealed.length > 0 || shown.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
                {t.publicResults.revealed}
              </span>
              {revealed.map(([id, cards]) => (
                <div key={id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-[15px]">{nameOf(id)}</span>
                  <Hand cards={cards} />
                </div>
              ))}
              {shown.map(([id, cards]) => (
                <div key={id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-[15px]">
                    {nameOf(id)}{' '}
                    <span className="text-xs text-ink-300">({t.publicResults.shownAfter})</span>
                  </span>
                  <Hand cards={cards} />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
              {t.publicResults.boot(r.boot)} · {t.publicResults.moves(moves.length)}
            </span>
            <ol className="flex flex-col gap-0.5 text-[13px] text-ink-300">
              {moves.map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{t.publicResults.action[a.type]!(nameOf(a.playerId), a.amount)}</span>
                  <span className="tabular shrink-0 text-ink-500">
                    {t.publicResults.pot(a.potAfter)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </details>
    </li>
  );
}

/** Read-only results page anyone with the link can open (/r/<id>). */
export default function PublicResults() {
  const { id = '' } = useParams();
  const [load, setLoad] = useState<Load<ResultsPage>>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    api<ResultsPage>(`/api/results/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((data) => setLoad({ state: 'ok', data }))
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setLoad(loadFailed(e));
      });
    return () => controller.abort();
  }, [id]);

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-8">
        <header className="flex items-center gap-2">
          <Link
            to="/"
            aria-label={t.results.home}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </Link>
          <span className="font-display text-lg font-bold">{t.appName}</span>
        </header>

        {load.state === 'loading' && (
          <p role="status" className="animate-pulse text-ink-300">
            {t.publicResults.loading}
          </p>
        )}
        {load.state === 'notFound' && <p className="text-[15px]">{t.publicResults.notFound}</p>}
        {load.state === 'error' && <p className="text-down">{t.publicResults.error}</p>}
        {load.state === 'ok' && <Page p={load.data} />}

        <Link
          to="/"
          className="flex min-h-[52px] items-center justify-center rounded-2xl bg-panel text-[15px] font-semibold"
        >
          {t.publicResults.playYourOwn}
        </Link>
      </div>
    </main>
  );
}

function Page({ p }: { p: ResultsPage }) {
  const names = new Map(p.players.map((x) => [x.id, x.name]));
  for (const r of p.results?.rankings ?? []) names.set(r.playerId, r.name);
  const nameOf = (pid: string | null) => (pid ? (names.get(pid) ?? '?') : t.common.host);
  const eyebrow = `${date.format(p.endedAt ?? p.createdAt)} · ${p.code}`;
  const standings = [...p.players].sort((a, b) => b.net - a.net);
  return (
    <>
      {p.groupName && (
        <p className="-mb-3 flex items-center justify-center gap-2 text-[13px] text-ink-300">
          <Icon name="users" size={16} />
          {t.publicResults.group(p.groupName)}
        </p>
      )}
      {p.results ? (
        <ResultsCard eyebrow={eyebrow} res={p.results} nameOf={(x) => nameOf(x)} />
      ) : (
        <section className="flex flex-col gap-3">
          <header className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
              {eyebrow}
            </span>
            <h1 className="font-display text-3xl font-bold">{t.publicResults.title}</h1>
          </header>
          <p className="text-[15px] text-ink-300">
            {p.status === 'lobby' ? t.publicResults.lobby : t.publicResults.live}
          </p>
          {p.status !== 'lobby' && (
            <ol className="flex flex-col gap-2">
              {standings.map((x, i) => (
                <li key={x.id} className="flex items-center gap-3 rounded-2xl bg-panel p-3">
                  <span className="w-5 text-center font-display font-bold text-ink-300">
                    {i + 1}
                  </span>
                  <Avatar id={x.id} name={x.name} avatar={x.avatar} size={36} />
                  <span className="flex-1 truncate text-[15px] font-semibold">{x.name}</span>
                  <span
                    className={`tabular font-display font-bold ${x.net > 0 ? 'text-up' : x.net < 0 ? 'text-down' : 'text-ink-300'}`}
                  >
                    {net(x.net)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">{t.publicResults.rounds}</h2>
        {p.rounds.length === 0 ? (
          <p className="text-ink-300">{t.publicResults.noRounds}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {p.rounds.map((r) => (
              <RoundItem key={r.roundNumber} r={r} nameOf={nameOf} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
