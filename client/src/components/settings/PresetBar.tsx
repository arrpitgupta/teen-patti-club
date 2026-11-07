import { SettingsSchema, type Settings } from '@tpc/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { deletePreset, getPresets, savePreset, type RulePreset } from '../../lib/storage';
import { Icon } from '../ui/Icon';

/** Order-independent comparison of two settings objects. */
function sameSettings(a: Settings, b: Settings): boolean {
  const norm = (s: Settings) =>
    JSON.stringify(Object.fromEntries(Object.entries(s).sort(([x], [y]) => x.localeCompare(y))));
  return norm(a) === norm(b);
}

/**
 * House-rule presets (saved on this device): pick one to fill the form, or save the current
 * rules under a name. With `lockChips` (game already started) the chip settings are kept.
 */
export function PresetBar({
  s,
  setS,
  lockChips = false,
}: {
  s: Settings;
  setS: (s: Settings) => void;
  lockChips?: boolean;
}) {
  const [presets, setPresets] = useState<RulePreset[]>(getPresets);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const valid = SettingsSchema.safeParse(s).success;
  const replacing = presets.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());

  const apply = (p: RulePreset) => {
    const next: Settings = lockChips
      ? { ...p.settings, chipMode: s.chipMode, startingChips: s.startingChips }
      : p.settings;
    setS(structuredClone(next));
    setNote(t.presets.applied(p.name) + (lockChips ? ` ${t.presets.chipsKept}` : ''));
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || !valid) return;
    setPresets(savePreset(clean, s));
    setNote(t.presets.saved(clean.slice(0, 24)));
    setNaming(false);
    setName('');
  };

  return (
    <section className="flex flex-col gap-2" aria-label={t.presets.title}>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.presets.title}
        </span>
        {presets.length > 0 && <span className="text-xs text-ink-500">{t.presets.hint}</span>}
      </div>

      {presets.length === 0 ? (
        <p className="text-[13px] text-ink-300">{t.presets.none}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const on = sameSettings(p.settings, s);
            return (
              <li
                key={p.name}
                className={`flex min-h-[44px] items-center rounded-full ${on ? 'bg-ink-100 text-felt-950' : 'bg-panel'}`}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => apply(p)}
                  className="flex min-h-[44px] items-center gap-1.5 pl-4 pr-1 text-sm font-semibold"
                >
                  {on && <Icon name="check" size={16} strokeWidth={2.6} />}
                  {p.name}
                </button>
                <button
                  type="button"
                  aria-label={t.presets.remove(p.name)}
                  onClick={() => setPresets(deletePreset(p.name))}
                  className={`flex h-11 w-10 items-center justify-center rounded-full ${on ? 'text-felt-800' : 'text-ink-500'}`}
                >
                  <Icon name="x" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {naming ? (
        <form onSubmit={save} className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              placeholder={t.presets.namePlaceholder}
              aria-label={t.presets.nameLabel}
              className="min-h-[48px] min-w-0 flex-1 rounded-xl bg-panel px-3.5 text-base font-semibold text-ink-100 outline-none focus:shadow-[inset_0_0_0_2px_#F4F1EA]"
            />
            <button
              type="submit"
              disabled={!name.trim() || !valid}
              className="min-h-[48px] rounded-xl bg-ink-100 px-4 text-[15px] font-semibold text-felt-950 disabled:bg-panel-sunk disabled:text-ink-500"
            >
              {t.common.save}
            </button>
            <button
              type="button"
              onClick={() => setNaming(false)}
              aria-label={t.common.cancel}
              className="flex h-12 w-11 items-center justify-center rounded-xl text-ink-300"
            >
              <Icon name="x" size={20} />
            </button>
          </div>
          {replacing && <span className="text-xs text-ink-300">{t.presets.replace}</span>}
        </form>
      ) : (
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            setNaming(true);
            setNote(null);
          }}
          className="flex min-h-[44px] items-center gap-2 self-start rounded-xl px-1 text-sm font-semibold text-ink-100 disabled:text-ink-500"
        >
          <Icon name="plus" size={18} />
          {t.presets.save}
        </button>
      )}
      {note && (
        <p className="text-[13px] text-ink-300" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
