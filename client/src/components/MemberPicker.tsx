import type { GroupMember } from '@tpc/shared';
import { t } from '../i18n';
import { Avatar } from './ui/Avatar';
import { Icon } from './ui/Icon';

/** Group games: "Who are you?" — pick an existing member so the group's stats add up. */
export function MemberPicker({
  members,
  value,
  onPick,
}: {
  members: (GroupMember & { taken?: boolean })[];
  /** Selected member id; null = someone new (type a name below). */
  value: string | null;
  onPick: (m: GroupMember | null) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={t.groups.playingAs} className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.groups.playingAs}
        </span>
        <p className="text-[13px] text-ink-300">{t.groups.playingAsHint}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {members.map((m) => {
            const on = value === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={m.taken}
                onClick={() => onPick(m)}
                className={`flex min-h-[56px] items-center gap-2 rounded-xl px-3 text-left disabled:opacity-40 ${on ? 'bg-ink-100 text-felt-950' : 'bg-panel'}`}
              >
                <Avatar id={m.id} name={m.name} avatar={m.avatar} size={32} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">{m.name}</span>
                  {m.taken && <span className="text-xs">{t.groups.taken}</span>}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            onClick={() => onPick(null)}
            className={`flex min-h-[56px] items-center gap-2 rounded-xl px-3 text-left ${value === null ? 'bg-ink-100 text-felt-950' : 'bg-panel'}`}
          >
            <Icon name="plus" size={20} />
            <span className="text-[15px] font-semibold">{t.groups.someoneElse}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
