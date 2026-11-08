import {
  groupLeaderboard,
  GroupNameSchema,
  monthStart,
  type GroupGameRow,
  type GroupInfo,
} from '@tpc/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { rulesSummary } from '../components/settings/rulesSummary';
import { SettingsForm, useSettingsDraft } from '../components/settings/SettingsForm';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Sheet } from '../components/ui/Sheet';
import { t } from '../i18n';
import { api, ApiError, loadFailed, type Load } from '../lib/api';
import { groupUrl } from '../lib/config';
import { net } from '../lib/format';
import { getSeat, rememberGroup } from '../lib/storage';
import { useGame } from '../store/game';

const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

const netClass = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-ink-300');

/** The group page (/group/<secret id>): leaderboard, past games, house rules, new game. */
export default function GroupPage() {
  const { id = '' } = useParams();
  const [load, setLoad] = useState<Load<GroupInfo>>({ state: 'loading' });

  const refresh = useCallback(
    (signal?: AbortSignal) =>
      api<GroupInfo>(`/api/groups/${encodeURIComponent(id)}`, signal ? { signal } : {})
        .then((data) => {
          rememberGroup(data.id, data.name);
          setLoad({ state: 'ok', data });
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setLoad(loadFailed(e));
        }),
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-8">
        <header className="flex items-center gap-2">
          <Link
            to="/groups"
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </Link>
          <h1 className="truncate font-display text-2xl font-bold">
            {load.state === 'ok' ? load.data.name : t.groups.link}
          </h1>
        </header>
        {load.state === 'loading' && (
          <p role="status" className="animate-pulse text-ink-300">
            {t.groups.loading}
          </p>
        )}
        {load.state === 'notFound' && <p className="text-[15px]">{t.groups.notFound}</p>}
        {load.state === 'error' && <p className="text-down">{t.groups.error}</p>}
        {load.state === 'ok' && (
          <Group g={load.data} onChange={(data) => setLoad({ state: 'ok', data })} />
        )}
      </div>
    </main>
  );
}

function Group({ g, onChange }: { g: GroupInfo; onChange: (g: GroupInfo) => void }) {
  const navigate = useNavigate();
  const live = g.games.filter((x) => x.status !== 'ended');
  const ended = g.games.filter((x) => x.status === 'ended');
  const [editing, setEditing] = useState<null | 'rules' | 'name'>(null);

  return (
    <>
      <p className="-mt-4 text-[13px] text-ink-300">
        {t.groups.members(g.members.length)} · {rulesSummary(g.settings).join(' · ')}
      </p>
      <Button
        variant="ivory"
        size="lg"
        icon="plus"
        block
        onClick={() => navigate(`/create?group=${encodeURIComponent(g.id)}`)}
      >
        {t.groups.newGame}
      </Button>

      {live.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">{t.groups.liveGames}</h2>
          <ul className="flex flex-col gap-2">
            {live.map((x) => (
              <li key={x.code}>
                <Link
                  to={getSeat(x.code) ? `/g/${x.code}` : `/join/${x.code}`}
                  className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-panel px-4 py-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="tabular text-[15px] font-semibold tracking-[0.08em]">
                      {x.code}
                    </span>
                    <span className="truncate text-[13px] text-ink-300">
                      {x.players.map((p) => p.name).join(', ')}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold">{t.groups.join}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Leaderboard g={g} />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">{t.groups.pastGames}</h2>
        {ended.length === 0 ? (
          <p className="text-ink-300">{t.groups.noGames}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ended.map((x) => (
              <PastGame key={x.code} x={x} />
            ))}
          </ul>
        )}
      </section>

      <Invite g={g} />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">{t.groups.houseRules}</h2>
        <p className="text-[15px] text-ink-300">{rulesSummary(g.settings).join(' · ')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button icon="sliders" onClick={() => setEditing('rules')}>
            {t.groups.editRules}
          </Button>
          <Button onClick={() => setEditing('name')}>{t.groups.rename}</Button>
        </div>
      </section>

      <EditRules
        g={g}
        open={editing === 'rules'}
        onClose={() => setEditing(null)}
        onSaved={onChange}
      />
      <Rename g={g} open={editing === 'name'} onClose={() => setEditing(null)} onSaved={onChange} />
    </>
  );
}

function Leaderboard({ g }: { g: GroupInfo }) {
  const [range, setRange] = useState<'month' | 'all'>('month');
  const rows = useMemo(
    () => groupLeaderboard(g.games, g.members, range === 'month' ? monthStart(Date.now()) : 0),
    [g, range],
  );
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">{t.groups.leaderboard}</h2>
        <div
          role="radiogroup"
          aria-label={t.groups.leaderboard}
          className="flex rounded-xl bg-panel p-1"
        >
          {(['month', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`min-h-[44px] rounded-lg px-3 text-[13px] font-semibold ${range === r ? 'bg-ink-100 text-felt-950' : 'text-ink-300'}`}
            >
              {r === 'month' ? t.groups.thisMonth : t.groups.allTime}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-300">
          {range === 'month' ? t.groups.noGamesMonth : t.groups.noGames}
        </p>
      ) : (
        <ol
          className="flex flex-col gap-2"
          aria-label={range === 'month' ? t.groups.thisMonth : t.groups.allTime}
        >
          {rows.map((r, i) => (
            <li key={r.memberId} className="flex items-center gap-3 rounded-2xl bg-panel p-3">
              <span className="w-5 text-center font-display font-bold text-ink-300">{i + 1}</span>
              <Avatar id={r.memberId} name={r.name} avatar={r.avatar} size={40} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{r.name}</span>
                <span className="text-xs text-ink-300">
                  {t.groups.games(r.games)} · {t.groups.wins(r.wins)} · {t.groups.best(net(r.best))}
                </span>
              </div>
              <span className={`tabular font-display text-lg font-bold ${netClass(r.net)}`}>
                {net(r.net)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PastGame({ x }: { x: GroupGameRow }) {
  const top = x.players[0];
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">
          {date.format(x.endedAt ?? x.createdAt)} · {x.code}
        </span>
        <span className="truncate text-[13px] text-ink-300">
          {x.players.map((p) => `${p.name} ${net(p.net)}`).join(' · ')}
        </span>
      </span>
      {top && (
        <span className={`tabular shrink-0 font-display font-bold ${netClass(top.net)}`}>
          {top.name.split(' ')[0]}
        </span>
      )}
    </>
  );
  const cls = 'flex min-h-[64px] items-center gap-3 rounded-2xl bg-panel px-4 py-2';
  return (
    <li>
      {x.resultsId ? (
        <Link to={`/r/${x.resultsId}`} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function Invite({ g }: { g: GroupInfo }) {
  const [copied, setCopied] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const url = groupUrl(g.id);
  const text = t.groups.shareText(g.name, url);
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: g.name, text, url });
        return;
      } catch {
        // cancelled: fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <section className="flex flex-col gap-2 rounded-3xl bg-panel p-4">
      <h2 className="font-display text-lg font-bold">{t.groups.share}</h2>
      <p className="text-[13px] text-ink-300">{t.groups.secretHint}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button icon="share" onClick={() => void share()}>
          {t.groups.shareButton}
        </Button>
        <Button
          icon={copied ? 'check' : 'copy'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              pushToast(url);
            }
          }}
        >
          {copied ? t.common.copied : t.results.copyLink}
        </Button>
      </div>
    </section>
  );
}

type EditProps = {
  g: GroupInfo;
  open: boolean;
  onClose: () => void;
  onSaved: (g: GroupInfo) => void;
};

function useSave(g: GroupInfo, onSaved: (g: GroupInfo) => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const save = async (body: { name?: string; settings?: GroupInfo['settings'] }) => {
    setBusy(true);
    try {
      const next = await api<GroupInfo>(`/api/groups/${encodeURIComponent(g.id)}`, {
        method: 'PATCH',
        body,
      });
      rememberGroup(next.id, next.name);
      onSaved(next);
      pushToast(t.groups.saved);
      onClose();
    } catch (e) {
      pushToast(e instanceof ApiError ? e.message : t.errors.generic, 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

function EditRules({ g, open, onClose, onSaved }: EditProps) {
  const draft = useSettingsDraft(g.settings);
  const { busy, save } = useSave(g, onSaved, onClose);
  const { setS } = draft;
  useEffect(() => {
    if (open) setS(g.settings);
  }, [open, g.settings, setS]);
  return (
    <Sheet open={open} onClose={onClose} title={t.groups.houseRules} tall>
      <SettingsForm s={draft.s} setS={draft.setS} />
      {draft.error && <p className="text-sm text-down">{draft.error}</p>}
      <Button
        variant="ivory"
        size="lg"
        block
        disabled={!draft.valid || busy}
        onClick={() => void save({ settings: draft.s })}
      >
        {t.groups.saveRules}
      </Button>
    </Sheet>
  );
}

function Rename({ g, open, onClose, onSaved }: EditProps) {
  const [name, setName] = useState(g.name);
  const { busy, save } = useSave(g, onSaved, onClose);
  useEffect(() => {
    if (open) setName(g.name);
  }, [open, g.name]);
  return (
    <Sheet open={open} onClose={onClose} title={t.groups.rename}>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.groups.name}
        </span>
        <input
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          className="min-h-[52px] rounded-xl bg-panel px-4 text-[16px] outline-none focus:shadow-[inset_0_0_0_2px_#F4F1EA]"
        />
      </label>
      <Button
        variant="ivory"
        size="lg"
        block
        disabled={!GroupNameSchema.safeParse(name).success || busy}
        onClick={() => void save({ name: name.trim() })}
      >
        {t.common.save}
      </Button>
    </Sheet>
  );
}
