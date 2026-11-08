import type { GroupInfo, GroupMember, JoinResult } from '@tpc/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MemberPicker } from '../components/MemberPicker';
import { ProfilePicker } from '../components/ProfilePicker';
import { PresetBar } from '../components/settings/PresetBar';
import { SettingsForm, useSettingsDraft } from '../components/settings/SettingsForm';
import { Icon } from '../components/ui/Icon';
import { t } from '../i18n';
import { api, loadFailed, type Load } from '../lib/api';
import { act } from '../lib/socket';
import { getProfile, saveProfile, saveSeat } from '../lib/storage';
import { INITIALS } from '../components/ui/Avatar';

export default function CreateGame() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = params.get('group');
  const profile = getProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? INITIALS);
  const draft = useSettingsDraft();
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState<Load<GroupInfo> | null>(groupId ? { state: 'loading' } : null);
  const [member, setMember] = useState<GroupMember | null>(null);
  const { setS } = draft;

  // A game for a group starts with the group's house rules; the profile name picks the member.
  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    api<GroupInfo>(`/api/groups/${encodeURIComponent(groupId)}`, { signal: controller.signal })
      .then((g) => {
        setGroup({ state: 'ok', data: g });
        setS(g.settings);
        const key = (getProfile()?.name ?? '').trim().toLocaleLowerCase();
        setMember(g.members.find((m) => m.name.toLocaleLowerCase() === key) ?? null);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setGroup(loadFailed(e));
      });
    return () => controller.abort();
  }, [groupId, setS]);

  const g = group?.state === 'ok' ? group.data : null;
  const playName = member ? member.name : name.trim();
  const ready = !groupId || g !== null;
  const valid = ready && playName.length > 0 && draft.valid;

  const submit = async () => {
    setBusy(true);
    const res = await act<'game:create', JoinResult>('game:create', {
      name: playName,
      avatar: member ? member.avatar : avatar,
      settings: draft.s,
      ...(g ? { groupId: g.id } : {}),
      ...(g && member ? { memberId: member.id } : {}),
    });
    setBusy(false);
    if (!res) return;
    if (!member) saveProfile({ name: playName, avatar });
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
            to={groupId ? `/group/${groupId}` : '/'}
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </Link>
          <h1 className="truncate font-display text-2xl font-bold">
            {g ? t.groups.fromGroup(g.name) : t.create.title}
          </h1>
        </header>
        {group?.state === 'loading' && (
          <p role="status" className="animate-pulse text-ink-300">
            {t.groups.loading}
          </p>
        )}
        {group?.state === 'notFound' && <p className="text-down">{t.groups.notFound}</p>}
        {group?.state === 'error' && <p className="text-down">{t.groups.error}</p>}

        {g && g.members.length > 0 && (
          <MemberPicker members={g.members} value={member?.id ?? null} onPick={setMember} />
        )}
        {!member && (
          <ProfilePicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
        )}
        {g ? (
          <p className="rounded-2xl bg-panel p-3 text-[13px] text-ink-300">{t.groups.rulesNote}</p>
        ) : (
          <PresetBar s={draft.s} setS={draft.setS} />
        )}
        {ready && <SettingsForm s={draft.s} setS={draft.setS} />}
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
