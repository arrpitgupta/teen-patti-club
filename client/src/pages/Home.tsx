import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { SERVER_URL } from '../lib/config';
import { getPrefs, latestSeat, savePrefs } from '../lib/storage';
import { Walkthrough } from '../components/learn/Walkthrough';
import { Sheet } from '../components/ui/Sheet';
import { useInstall } from '../lib/pwa';
import { Icon } from '../components/ui/Icon';

type ServerStatus = 'waking' | 'slow' | 'ready' | 'offline';

export default function Home() {
  const [status, setStatus] = useState<ServerStatus>('waking');
  const seat = latestSeat();
  // First launch: the "How to play" cards (skippable; re-open from Learn or the table menu).
  const [firstLaunch, setFirstLaunch] = useState(() => !getPrefs().seenWalkthrough);
  const installer = useInstall();
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const slow = setTimeout(() => setStatus((s) => (s === 'waking' ? 'slow' : s)), 4000);
    // Render's free tier can take ~30 s to cold-start.
    const giveUp = setTimeout(() => controller.abort(), 60_000);
    fetch(`${SERVER_URL}/health`, { signal: controller.signal })
      .then((res) => setStatus(res.ok ? 'ready' : 'offline'))
      .catch(() => setStatus('offline'))
      .finally(() => {
        clearTimeout(slow);
        clearTimeout(giveUp);
      });
    return () => {
      clearTimeout(slow);
      clearTimeout(giveUp);
      controller.abort();
    };
  }, []);

  const statusText =
    status === 'ready'
      ? t.home.ready
      : status === 'offline'
        ? t.home.offline
        : status === 'slow'
          ? t.home.wakingSlow
          : t.home.waking;

  return (
    <main className="screen items-center justify-center gap-10 px-5 py-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-3xl bg-felt-900 shadow-[inset_0_0_0_1.5px_#5A3A22]"
          aria-hidden="true"
        >
          <div className="h-9 w-6 translate-x-1.5 -rotate-12 rounded-md bg-card-face" />
          <div className="relative z-10 h-9 w-6 rounded-md bg-card-face shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
          <div className="card-back h-9 w-6 -translate-x-1.5 rotate-12 rounded-md" />
        </div>
        <h1 className="font-display text-4xl font-bold">{t.appName}</h1>
        <p className="max-w-xs text-ink-300">{t.tagline}</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {seat && (
          <Link
            to={`/g/${seat.code}`}
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-panel text-[16px] font-semibold"
          >
            <Icon name="arrowRight" size={18} />
            {t.home.rejoin(seat.code)}
          </Link>
        )}
        <Link
          to="/create"
          className="flex min-h-[72px] flex-col items-center justify-center rounded-2xl bg-ink-100 text-felt-950"
        >
          <span className="font-display text-xl font-bold">{t.home.create}</span>
          <span className="text-[13px] text-felt-800">{t.home.createHint}</span>
        </Link>
        <Link
          to="/join"
          className="flex min-h-[72px] flex-col items-center justify-center rounded-2xl bg-panel shadow-[inset_0_0_0_1.5px_rgba(244,241,234,0.2)]"
        >
          <span className="font-display text-xl font-bold">{t.home.join}</span>
          <span className="text-[13px] text-ink-300">{t.home.joinHint}</span>
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/learn"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-ink-100 active:bg-white/5"
          >
            <Icon name="info" size={18} />
            {t.learn.open}
          </Link>
          <Link
            to="/history"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-ink-100 active:bg-white/5"
          >
            <Icon name="log" size={18} />
            {t.history.link}
          </Link>
        </div>
      </div>
      {installer.mode && (
        <button
          type="button"
          onClick={() =>
            installer.mode === 'prompt' ? void installer.install() : setIosHelp(true)
          }
          className="-mt-6 flex min-h-[52px] w-full max-w-sm items-center gap-3 rounded-2xl bg-panel px-4 text-left"
        >
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">{t.install.button}</span>
            <span className="text-xs text-ink-300">{t.install.hint}</span>
          </span>
        </button>
      )}
      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title={t.install.iosTitle}>
        <p className="text-[15px] leading-relaxed text-ink-300">{t.install.iosBody}</p>
      </Sheet>
      {firstLaunch && (
        <Walkthrough
          onDone={() => {
            savePrefs({ ...getPrefs(), seenWalkthrough: true });
            setFirstLaunch(false);
          }}
        />
      )}

      <div className="flex flex-col items-center gap-2">
        <p
          role="status"
          className="flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm"
        >
          <span
            className={`h-2 w-2 rounded-full ${status === 'ready' ? 'bg-up' : status === 'offline' ? 'bg-down' : 'animate-pulse bg-ink-300'}`}
          />
          {statusText}
        </p>
        <p className="text-xs text-ink-500">{t.virtualOnly}</p>
      </div>
    </main>
  );
}
