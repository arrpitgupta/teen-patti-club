import { defaultSettings, GroupNameSchema, type GroupInfo } from '@tpc/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PresetBar } from '../components/settings/PresetBar';
import { SettingsForm, useSettingsDraft } from '../components/settings/SettingsForm';
import { Icon } from '../components/ui/Icon';
import { t } from '../i18n';
import { api, ApiError } from '../lib/api';
import { getGroups, getPresets, rememberGroup } from '../lib/storage';
import { useGame } from '../store/game';

/** Groups opened on this phone, and creating a new one. */
export default function GroupsPage() {
  const navigate = useNavigate();
  const groups = getGroups();
  const [creating, setCreating] = useState(groups.length === 0);
  const [name, setName] = useState('');
  // Start from the newest saved preset, if any.
  const draft = useSettingsDraft(getPresets()[0]?.settings ?? defaultSettings('digital'));
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const nameOk = GroupNameSchema.safeParse(name).success;

  const create = async () => {
    setBusy(true);
    try {
      const g = await api<GroupInfo>('/api/groups', {
        method: 'POST',
        body: { name: name.trim(), settings: draft.s },
      });
      rememberGroup(g.id, g.name);
      navigate(`/group/${g.id}`, { replace: true });
    } catch (e) {
      pushToast(e instanceof ApiError ? e.message : t.errors.generic, 'error');
      setBusy(false);
    }
  };

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 pb-8">
        <header className="flex items-center gap-2">
          <Link
            to="/"
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </Link>
          <h1 className="font-display text-2xl font-bold">{t.groups.title}</h1>
        </header>
        <p className="text-[15px] text-ink-300">{t.groups.intro}</p>

        {groups.length > 0 && (
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/group/${g.id}`}
                  className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-panel px-4"
                >
                  <Icon name="users" size={20} className="text-ink-300" />
                  <span className="flex-1 truncate text-[16px] font-semibold">{g.name}</span>
                  <Icon name="arrowRight" size={18} className="text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {groups.length === 0 && <p className="text-[13px] text-ink-500">{t.groups.openLink}</p>}

        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-ink-100 font-display text-lg font-bold text-felt-950"
          >
            <Icon name="plus" size={20} />
            {t.groups.create}
          </button>
        ) : (
          <section className="flex flex-col gap-5" aria-label={t.groups.createTitle}>
            <h2 className="font-display text-xl font-bold">{t.groups.createTitle}</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
                {t.groups.name}
              </span>
              <input
                value={name}
                maxLength={30}
                placeholder={t.groups.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
                className="min-h-[52px] rounded-xl bg-panel px-4 text-[16px] outline-none placeholder:text-ink-500 focus:shadow-[inset_0_0_0_2px_#F4F1EA]"
              />
            </label>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
              {t.groups.rules}
            </p>
            <PresetBar s={draft.s} setS={draft.setS} />
            <SettingsForm s={draft.s} setS={draft.setS} />
            {draft.error && <p className="text-sm text-down">{draft.error}</p>}
            <button
              type="button"
              disabled={!nameOk || !draft.valid || busy}
              onClick={() => void create()}
              className="sticky bottom-4 min-h-[60px] rounded-2xl bg-ink-100 font-display text-lg font-bold text-felt-950 shadow-[0_10px_24px_rgba(0,0,0,0.5)] disabled:bg-panel-sunk disabled:text-ink-500"
            >
              {t.groups.createSubmit}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
