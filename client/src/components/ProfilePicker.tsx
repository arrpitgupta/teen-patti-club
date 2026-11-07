import { t } from '../i18n';
import { Avatar, AVATARS, INITIALS } from './ui/Avatar';

export function ProfilePicker({
  name,
  avatar,
  onName,
  onAvatar,
}: {
  name: string;
  avatar: string;
  onName: (v: string) => void;
  onAvatar: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.profile.name}
        </span>
        <input
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder={t.profile.namePlaceholder}
          onChange={(e) => onName(e.target.value)}
          className="min-h-[52px] rounded-xl bg-panel px-4 text-[17px] font-semibold text-ink-100 outline-none placeholder:text-ink-500 focus:shadow-[inset_0_0_0_2px_#F4F1EA]"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.profile.avatar}
        </span>
        <div role="radiogroup" aria-label={t.profile.avatar} className="grid grid-cols-7 gap-2">
          {[INITIALS, ...AVATARS].map((a) => {
            const on = a === avatar;
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a === INITIALS ? t.profile.initials : a}
                onClick={() => onAvatar(a)}
                className={`flex aspect-square items-center justify-center rounded-2xl ${on ? 'bg-ink-100/15 shadow-[inset_0_0_0_2px_#F4F1EA]' : 'bg-panel'}`}
              >
                <Avatar id={name || 'you'} name={name || '?'} avatar={a} size={36} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
