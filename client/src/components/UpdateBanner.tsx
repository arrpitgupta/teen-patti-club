import { t } from '../i18n';
import { useUpdateReady } from '../lib/pwa';

/** A new version was deployed while you were at a table: reload when it suits you. */
export function UpdateBanner() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(env(safe-area-inset-top),8px)]"
    >
      <div className="flex items-center gap-3 rounded-full bg-ink-100 py-1 pl-4 pr-1 text-[13px] font-semibold text-felt-950 shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
        {t.update.ready}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[44px] rounded-full bg-felt-950 px-4 text-ink-100"
        >
          {t.update.reload}
        </button>
      </div>
    </div>
  );
}
