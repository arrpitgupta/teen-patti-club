import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/game';

/** Toasts inside the table's felt centre (table screen only). */
export function InlineToasts({ max }: { max: number }) {
  const toasts = useGame((s) => s.toasts).slice(-max);
  return (
    <div className="flex flex-col items-center gap-1.5" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.span
            key={toast.id}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={[
              'max-w-[220px] truncate rounded-full px-3 py-1 text-[13px] font-semibold shadow-[0_4px_12px_rgba(0,0,0,0.35)]',
              toast.tone === 'error' ? 'bg-[#3A1A18] text-down' : 'bg-felt-950/85 text-ink-100',
            ].join(' ')}
          >
            {toast.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const inline = useGame((s) => s.inlineToasts);
  if (inline) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(64px,calc(env(safe-area-inset-top)+60px))] z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={() => dismiss(toast.id)}
            className={[
              'pointer-events-auto max-w-sm rounded-2xl px-4 py-2.5 text-left text-sm shadow-[0_8px_20px_rgba(0,0,0,0.45)]',
              toast.tone === 'error' ? 'bg-[#3A1A18] text-down' : 'bg-panel text-ink-100',
            ].join(' ')}
          >
            {toast.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
