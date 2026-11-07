import { defaultSettings, SettingsSchema, type Settings } from '@tpc/shared';
import { isValidElement, useState, type ReactNode } from 'react';
import { t } from '../../i18n';

export function useSettingsDraft(initial?: Settings) {
  const [s, setS] = useState<Settings>(initial ?? defaultSettings('digital'));
  const parsed = SettingsSchema.safeParse(s);
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
  return { s, setS, error, valid: parsed.success };
}

function Segmented<T extends string | number | null>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl px-2 py-2 text-center ${on ? 'bg-ink-100 text-felt-950' : 'bg-panel text-ink-100'}`}
          >
            <span className="text-[15px] font-semibold">{o.label}</span>
            {o.hint && (
              <span className={`text-xs ${on ? 'text-felt-800' : 'text-ink-300'}`}>{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  // A <label> would also label the first radio button inside a segmented control (its name
  // became "Cards Cards"). Segmented has its own aria-label, so use a plain wrapper there.
  if (isValidElement(children) && children.type === Segmented) {
    return (
      <div className="flex flex-col gap-1.5">
        <span
          className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300"
          aria-hidden="true"
        >
          {label}
        </span>
        {children}
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'min-h-[48px] rounded-xl bg-panel px-3.5 text-[16px] font-semibold text-ink-100 outline-none focus:shadow-[inset_0_0_0_2px_#F4F1EA]';

function NumberOrNone({
  value,
  onChange,
  noneLabel,
  fallback = 1000,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  noneLabel: string;
  /** Value to switch back to when "none" is turned off. */
  fallback?: number;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={value ?? ''}
        disabled={value === null}
        onChange={(e) =>
          onChange(e.target.value === '' ? 1 : Math.max(1, Math.floor(Number(e.target.value))))
        }
        className={`${inputClass} min-w-0 flex-1 disabled:text-ink-500`}
      />
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(value === null ? fallback : null)}
        className={`min-h-[48px] shrink-0 rounded-xl px-3 text-sm font-semibold ${value === null ? 'bg-ink-100 text-felt-950' : 'bg-panel'}`}
      >
        {noneLabel}
      </button>
    </div>
  );
}

/** Game rules form (create game, and host "Edit rules" between rounds). */
export function SettingsForm({
  s,
  setS,
  lockChips = false,
}: {
  s: Settings;
  setS: (s: Settings) => void;
  lockChips?: boolean;
}) {
  const c = t.create;
  const [advanced, setAdvanced] = useState(false);
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <Field label={c.mode}>
        <Segmented
          label={c.mode}
          value={s.mode}
          onChange={(mode) =>
            set({ mode, turnTimerSec: mode === 'physical' ? null : (s.turnTimerSec ?? 45) })
          }
          options={[
            { value: 'digital', label: c.digital, hint: c.digitalHint },
            { value: 'physical', label: c.physical, hint: c.physicalHint },
          ]}
        />
      </Field>

      {!lockChips && (
        <Field label={c.chipMode}>
          <Segmented
            label={c.chipMode}
            value={s.chipMode}
            onChange={(chipMode) =>
              set({
                chipMode,
                startingChips: chipMode === 'openTab' ? 0 : Math.max(s.boot * 50, 1000),
              })
            }
            options={[
              { value: 'openTab', label: c.openTab, hint: c.openTabHint },
              { value: 'buyIn', label: c.buyIn, hint: c.buyInHint },
            ]}
          />
        </Field>
      )}

      {!lockChips && s.chipMode === 'buyIn' && (
        <Field label={c.buyInAmount}>
          <input
            type="number"
            inputMode="numeric"
            min={s.boot}
            value={s.startingChips}
            onChange={(e) =>
              set({ startingChips: Math.max(0, Math.floor(Number(e.target.value))) })
            }
            className={inputClass}
          />
        </Field>
      )}

      <Field label={c.boot}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={s.boot}
          onChange={(e) => set({ boot: Math.max(1, Math.floor(Number(e.target.value))) })}
          className={inputClass}
        />
      </Field>

      <button
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced((a) => !a)}
        className="min-h-[48px] rounded-xl bg-panel text-[15px] font-semibold"
      >
        {c.advanced} {advanced ? '▴' : '▾'}
      </button>

      {advanced && (
        <div className="flex flex-col gap-5">
          <Field label={c.maxChaal}>
            <NumberOrNone
              value={s.maxChaal}
              onChange={(maxChaal) => set({ maxChaal })}
              noneLabel={c.noLimit}
            />
          </Field>
          <Field label={c.potLimit}>
            <NumberOrNone
              value={s.potLimit}
              onChange={(potLimit) => set({ potLimit })}
              noneLabel={c.noLimit}
            />
          </Field>
          <Field label={c.maxBlinds}>
            <NumberOrNone
              value={s.maxBlinds}
              onChange={(maxBlinds) => set({ maxBlinds })}
              noneLabel={c.noLimit}
              fallback={4}
            />
          </Field>
          <Field label={c.a23}>
            <Segmented
              label={c.a23}
              value={s.a23Rank}
              onChange={(a23Rank) => set({ a23Rank })}
              options={[
                { value: 'second', label: c.a23Second },
                { value: 'lowest', label: c.a23Lowest },
              ]}
            />
          </Field>
          <Field label={c.blindShow}>
            <Segmented
              label={c.blindShow}
              value={s.blindCanShow ? 'yes' : 'no'}
              onChange={(v) => set({ blindCanShow: v === 'yes' })}
              options={[
                { value: 'yes', label: t.common.yes },
                { value: 'no', label: t.common.no },
              ]}
            />
          </Field>
          <Field label={c.timer}>
            <Segmented
              label={c.timer}
              value={s.turnTimerSec}
              onChange={(turnTimerSec) => set({ turnTimerSec })}
              options={[
                { value: 30, label: '30 s' },
                { value: 45, label: '45 s' },
                { value: 60, label: '60 s' },
                { value: null, label: c.timerOff },
              ]}
            />
          </Field>
          {s.mode === 'physical' && (
            <Field label={c.physicalMethod}>
              <Segmented
                label={c.physicalMethod}
                value={s.physicalResolution}
                onChange={(physicalResolution) => set({ physicalResolution })}
                options={[
                  { value: 'hybrid', label: c.hybrid },
                  { value: 'tapWinner', label: c.tapWinner },
                  { value: 'enterCards', label: c.enterCards },
                ]}
              />
            </Field>
          )}
          <Field label={c.rate}>
            <NumberOrNone
              value={s.chipRate}
              onChange={(chipRate) => set({ chipRate })}
              noneLabel={c.rateOff}
              fallback={1}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
