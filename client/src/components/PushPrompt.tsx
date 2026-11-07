import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { enablePush, pushAvailable, pushPermission, pushSupport } from '../lib/push';
import { getPrefs, savePrefs } from '../lib/storage';
import { Icon } from './ui/Icon';

/**
 * Shown once, after the player has joined a game: explains what notifications are for and
 * only then asks the browser for permission.
 */
export function PushPrompt({ compact = false }: { compact?: boolean }) {
  const [show, setShow] = useState<'ask' | 'iphone' | null>(null);

  useEffect(() => {
    if (getPrefs().pushAsked) return;
    const support = pushSupport();
    if (support === 'needsInstall') {
      setShow('iphone');
      return;
    }
    if (support !== 'ok' || pushPermission() !== 'default') return;
    let alive = true;
    void pushAvailable().then((ok) => alive && ok && setShow('ask'));
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;
  const dismiss = () => {
    savePrefs({ ...getPrefs(), pushAsked: true });
    setShow(null);
  };

  return (
    <section
      className={`flex flex-col gap-2.5 rounded-2xl bg-panel ${compact ? 'p-3' : 'p-4'}`}
      aria-label={t.push.title}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-felt-950">
          <Icon name="bell" size={18} strokeWidth={2.2} />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-bold">{t.push.title}</h3>
          <p className="text-[13px] leading-snug text-ink-300">
            {show === 'iphone' ? t.push.iphone : t.push.body}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="min-h-[44px] rounded-xl px-3.5 text-sm font-semibold text-ink-300 active:bg-white/5"
        >
          {show === 'iphone' ? t.common.close : t.push.notNow}
        </button>
        {show === 'ask' && (
          <button
            type="button"
            onClick={() => void enablePush().finally(() => setShow(null))}
            className="min-h-[44px] rounded-xl bg-ink-100 px-4 text-sm font-bold text-felt-950"
          >
            {t.push.enable}
          </button>
        )}
      </div>
    </section>
  );
}
