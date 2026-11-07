import { MIN_PLAYERS } from '@tpc/shared';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PushPrompt } from '../components/PushPrompt';
import { HostSheet } from '../components/sheets/HostSheet';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { t } from '../i18n';
import { inviteNeedsLan, joinUrl } from '../lib/config';
import { chips } from '../lib/format';
import type { TableModel } from '../lib/model';
import { act } from '../lib/socket';
import { useGame } from '../store/game';

export default function LobbyRoom({ m }: { m: TableModel }) {
  const [hostOpen, setHostOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const code = m.pub.code;
  const url = joinUrl(code);
  const s = m.pub.table.settings;
  const players = m.pub.players.filter((p) => p.present);
  const count = players.length;

  const share = async () => {
    const text = t.lobby.whatsappInvite(code, url);
    if (navigator.share) {
      try {
        await navigator.share({ title: t.appName, text, url });
        return;
      } catch {
        // cancelled: fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast(url);
    }
  };

  const rules = [
    s.mode === 'physical' ? t.create.physical : t.create.digital,
    s.chipMode === 'openTab' ? t.create.openTab : `${t.create.buyIn} ${chips(s.startingChips)}`,
    `${t.create.boot.split(' (')[0]} ${chips(s.boot)}`,
    s.turnTimerSec
      ? `${t.create.timer} ${s.turnTimerSec}s`
      : `${t.create.timer} ${t.create.timerOff.toLowerCase()}`,
  ];

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto grid w-full max-w-4xl gap-6 pb-8 md:grid-cols-2">
        <section className="flex flex-col items-center gap-4 text-center">
          <header className="flex w-full items-center justify-between">
            <Link
              to="/"
              aria-label={t.common.back}
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
            >
              <Icon name="arrowLeft" size={22} />
            </Link>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
              {t.lobby.invite}
            </span>
            <span className="w-11" />
          </header>
          <p
            className="tabular font-display text-5xl font-bold tracking-[0.2em]"
            aria-label={`${t.join.code} ${code.split('').join(' ')}`}
          >
            {code}
          </p>
          <div className="rounded-3xl bg-card-face p-4">
            <QRCodeSVG value={url} size={196} bgColor="#FBF8F1" fgColor="#04140D" level="M" />
          </div>
          <p className="text-sm text-ink-300">{t.lobby.inviteHint}</p>
          {inviteNeedsLan() && (
            <p className="rounded-xl bg-overdue/15 p-3 text-left text-[13px] text-overdue">
              {t.lobby.lanWarning}
            </p>
          )}
          <div className="grid w-full grid-cols-2 gap-2">
            <Button icon="share" onClick={() => void share()}>
              {t.lobby.shareLink}
            </Button>
            <Button icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
              {copied ? t.common.copied : t.lobby.copyLink}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl font-bold">{t.lobby.players(count)}</h2>
            <span className="text-[13px] text-ink-300">{t.lobby.idealHint}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-panel p-3">
                <Avatar
                  id={p.id}
                  name={p.name}
                  avatar={p.avatar}
                  size={40}
                  dim={!p.isOffline && !p.connected}
                />
                <span className="flex-1 truncate text-[15px] font-semibold">
                  {m.nameOf(p.id)}
                  {p.id === m.meId && m.nameOf(p.id) !== p.name && (
                    <span className="text-ink-500"> ({p.name})</span>
                  )}
                </span>
                {m.pub.hostPlayerId === p.id && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-ink-300">
                    <Icon name="crown" size={14} />
                    {t.common.host}
                  </span>
                )}
                {p.isOffline && <span className="text-xs text-ink-500">{t.table.offlineSeat}</span>}
                {!p.isOffline && !p.connected && (
                  <span className="text-xs text-ink-500">{t.table.reconnecting}</span>
                )}
              </li>
            ))}
          </ul>

          <PushPrompt />

          <div className="rounded-2xl bg-panel p-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
              {t.lobby.rules}
            </span>
            <p className="mt-1 text-sm">{rules.join(' · ')}</p>
          </div>

          {m.isHost ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="ivory"
                size="lg"
                block
                disabled={count < MIN_PLAYERS}
                onClick={() => void act('game:start', {})}
              >
                {count < MIN_PLAYERS ? t.lobby.needTwo : t.lobby.start}
              </Button>
              <Button block onClick={() => setHostOpen(true)}>
                {t.lobby.editRules} · {t.lobby.addOffline}
              </Button>
            </div>
          ) : (
            <p
              className="rounded-2xl bg-panel p-4 text-center text-[15px] text-ink-300"
              role="status"
            >
              {t.lobby.waitingForHost}
            </p>
          )}
        </section>
      </div>
      {m.isHost && <HostSheet open={hostOpen} onClose={() => setHostOpen(false)} m={m} />}
    </main>
  );
}
