import type { GameSummary } from '@tpc/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { Sheet } from '../components/ui/Sheet';
import { t } from '../i18n';
import { SERVER_URL } from '../lib/config';
import { chips, net, rupees } from '../lib/format';
import { getSeats } from '../lib/storage';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; games: GameSummary[] };

const date = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Games this phone has played (found by the seat tokens saved on it). */
export default function HistoryPage() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [open, setOpen] = useState<GameSummary | null>(null);
  const seats = getSeats();

  useEffect(() => {
    const tokens = Object.values(getSeats()).map((s) => s.playerToken);
    if (tokens.length === 0) {
      setLoad({ state: 'ok', games: [] });
      return;
    }
    const controller = new AbortController();
    fetch(`${SERVER_URL}/api/history`, {
      headers: { 'x-player-tokens': tokens.join(',') },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const { games } = (await r.json()) as { games: GameSummary[] };
        setLoad({ state: 'ok', games: games.sort((a, b) => b.createdAt - a.createdAt) });
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setLoad({ state: 'error' });
      });
    return () => controller.abort();
  }, []);

  const myId = (g: GameSummary) => seats[g.code]?.playerId;

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-8">
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </button>
          <h1 className="font-display text-2xl font-bold">{t.history.title}</h1>
        </header>

        {load.state === 'loading' && (
          <p role="status" className="animate-pulse text-ink-300">
            {t.history.loading}
          </p>
        )}
        {load.state === 'error' && <p className="text-down">{t.history.error}</p>}
        {load.state === 'ok' && load.games.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-panel p-6 text-center">
            <p className="text-[15px] text-ink-300">{t.history.empty}</p>
            <Link
              to="/create"
              className="flex min-h-[48px] items-center rounded-xl bg-ink-100 px-5 font-semibold text-felt-950"
            >
              {t.home.create}
            </Link>
          </div>
        )}
        {load.state === 'ok' && load.games.length > 0 && (
          <ul className="flex flex-col gap-2">
            {load.games.map((g) => {
              const me = g.players.find((p) => p.id === myId(g));
              const rank = g.results
                ? g.results.rankings.findIndex((r) => r.playerId === me?.id) + 1
                : null;
              const n = me?.net ?? 0;
              return (
                <li key={g.code}>
                  <button
                    type="button"
                    onClick={() => (g.status === 'ended' ? setOpen(g) : navigate(`/g/${g.code}`))}
                    className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl bg-panel px-4 py-3 text-left"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">
                        {date.format(g.createdAt)} · {g.code}
                      </span>
                      <span className="truncate text-[13px] text-ink-300">
                        {g.mode === 'physical' ? t.create.physical : t.create.digital} ·{' '}
                        {t.history.players(g.players.length)} · {t.table.round(g.roundNumber)}
                        {g.status !== 'ended' && ` · ${t.history.open}`}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span
                        className={`tabular font-display text-lg font-bold ${n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-ink-300'}`}
                      >
                        {net(n)}
                      </span>
                      {rank ? (
                        <span className="text-xs text-ink-300">
                          {t.history.place(rank, g.players.length)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold">{t.history.rejoin}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        eyebrow={open ? `${date.format(open.createdAt)} · ${open.code}` : ''}
        title={t.results.title}
      >
        {open?.results && (
          <>
            <ol className="flex flex-col gap-2">
              {open.results.rankings.map((r, i) => (
                <li key={r.playerId} className="flex items-center gap-3 rounded-2xl bg-panel p-3">
                  <span className="w-5 text-center font-display font-bold text-ink-300">
                    {i + 1}
                  </span>
                  <Avatar id={r.playerId} name={r.name} avatar={r.avatar} size={36} />
                  <span className="flex-1 truncate text-[15px] font-semibold">
                    {r.playerId === myId(open) ? `${r.name} (${t.common.you})` : r.name}
                  </span>
                  <span
                    className={`tabular font-display font-bold ${r.net > 0 ? 'text-up' : r.net < 0 ? 'text-down' : 'text-ink-300'}`}
                  >
                    {net(r.net)}
                  </span>
                </li>
              ))}
            </ol>
            <h3 className="font-display text-lg font-bold">{t.results.settle}</h3>
            {open.results.payments.length === 0 ? (
              <p className="text-ink-300">{t.results.settleNone}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {open.results.payments.map((p, i) => {
                  const name = (id: string) =>
                    open.results!.rankings.find((r) => r.playerId === id)?.name ?? '?';
                  const money = rupees(p.amount, open.results!.chipRate);
                  return (
                    <li key={i} className="rounded-2xl bg-ink-100/[0.06] p-3 text-[15px]">
                      {t.results.pays(
                        name(p.from),
                        name(p.to),
                        `${chips(p.amount)} ${t.common.chips}${money ? ` (${money})` : ''}`,
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {open.resultsId && (
              <Link
                to={`/r/${open.resultsId}`}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-panel text-[15px] font-semibold"
              >
                <Icon name="log" size={18} />
                {t.history.roundByRound}
              </Link>
            )}
            <p className="pb-2 text-xs text-ink-500">{t.virtualOnly}</p>
          </>
        )}
      </Sheet>
    </main>
  );
}
