import type { JoinResult } from '@tpc/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProfilePicker } from '../components/ProfilePicker';
import { SettingsForm, useSettingsDraft } from '../components/settings/SettingsForm';
import { Icon } from '../components/ui/Icon';
import { t } from '../i18n';
import { act } from '../lib/socket';
import { getProfile, saveProfile, saveSeat } from '../lib/storage';
import { INITIALS } from '../components/ui/Avatar';

export default function CreateGame() {
  const navigate = useNavigate();
  const profile = getProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? INITIALS);
  const draft = useSettingsDraft();
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0 && draft.valid;

  const submit = async () => {
    setBusy(true);
    const res = await act<'game:create', JoinResult>('game:create', {
      name: name.trim(),
      avatar,
      settings: draft.s,
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
          <h1 className="font-display text-2xl font-bold">{t.create.title}</h1>
        </header>
        <ProfilePicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
        <SettingsForm s={draft.s} setS={draft.setS} />
        {draft.error && <p className="text-sm text-down">{draft.error}</p>}
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="sticky bottom-4 min-h-[60px] rounded-2xl bg-ink-100 font-display text-lg font-bold text-felt-950 shadow-[0_10px_24px_rgba(0,0,0,0.5)] disabled:bg-panel-sunk disabled:text-ink-500"
        >
          {t.create.submit}
        </button>
      </div>
    </main>
  );
}
