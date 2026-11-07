import type { JoinResult } from '@tpc/shared';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProfilePicker } from '../components/ProfilePicker';
import { canScanQr, QrScanner } from '../components/QrScanner';
import { INITIALS } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { t } from '../i18n';
import { act } from '../lib/socket';
import { getProfile, getSeat, saveProfile, saveSeat } from '../lib/storage';

const ALLOWED = /[^A-HJ-NP-Z2-9]/g;

export default function JoinGame() {
  const params = useParams();
  const navigate = useNavigate();
  const profile = getProfile();
  const [code, setCode] = useState(
    (params.code ?? '').toUpperCase().replace(ALLOWED, '').slice(0, 6),
  );
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? INITIALS);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const existing = code.length === 6 ? getSeat(code) : undefined;
  const valid = code.length === 6 && name.trim().length > 0;

  const onScan = useCallback((c: string) => {
    setScanning(false);
    setCode(c);
  }, []);

  const submit = async () => {
    setBusy(true);
    const res = await act<'game:join', JoinResult>('game:join', {
      code,
      name: name.trim(),
      avatar,
    });
    setBusy(false);
    if (!res) return;
    saveProfile({ name: name.trim(), avatar });
    saveSeat({
      code: res.code,
      playerId: res.playerId,
      playerToken: res.playerToken,
      joinedAt: Date.now(),
    });
    navigate(`/g/${res.code}`, { replace: true });
  };

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-8">
        <header className="flex items-center gap-2">
          <Link
            to="/"
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </Link>
          <h1 className="font-display text-2xl font-bold">{t.join.title}</h1>
        </header>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
            {t.join.code}
          </span>
          <div className="flex gap-2">
            <input
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder={t.join.codePlaceholder}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(ALLOWED, '').slice(0, 6))
              }
              className="tabular min-h-[60px] min-w-0 flex-1 rounded-xl bg-panel px-4 font-display text-[28px] font-bold tracking-[0.18em] outline-none placeholder:text-ink-500 focus:shadow-[inset_0_0_0_2px_#F4F1EA]"
            />
            {canScanQr() && (
              <button
                type="button"
                onClick={() => setScanning(true)}
                aria-label={t.join.scan}
                className="flex min-h-[60px] w-[60px] items-center justify-center rounded-xl bg-panel"
              >
                <Icon name="camera" size={24} />
              </button>
            )}
          </div>
        </label>

        {existing ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-panel p-4">
            <span className="text-[15px] font-semibold">{t.join.rejoinAs}</span>
            <Link
              to={`/g/${code}`}
              className="flex min-h-[56px] items-center justify-center rounded-2xl bg-ink-100 font-display text-lg font-bold text-felt-950"
            >
              {t.join.rejoin}
            </Link>
          </div>
        ) : (
          <>
            <ProfilePicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
            <button
              type="button"
              disabled={!valid || busy}
              onClick={() => void submit()}
              className="min-h-[60px] rounded-2xl bg-ink-100 font-display text-lg font-bold text-felt-950 disabled:bg-panel-sunk disabled:text-ink-500"
            >
              {t.join.submit}
            </button>
          </>
        )}
      </div>
      <QrScanner open={scanning} onClose={() => setScanning(false)} onCode={onScan} />
    </main>
  );
}
