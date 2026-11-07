import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '../../i18n';
import { Icon } from './Icon';

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  dismissible = true,
  tall = false,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  tall?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-[rgba(2,10,6,0.7)]"
            onClick={dismissible ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={[
              'relative flex w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-felt-900 px-5 pt-2.5 shadow-sheet outline-none pb-safe',
              'md:rounded-3xl md:pb-6',
              tall ? 'max-h-[94dvh] min-h-[70dvh]' : 'max-h-[90dvh]',
            ].join(' ')}
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-ink-100/25 md:hidden" />
            {(title || dismissible) && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  {eyebrow && (
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
                      {eyebrow}
                    </span>
                  )}
                  {title && (
                    <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">
                      {title}
                    </h2>
                  )}
                </div>
                {dismissible && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t.common.close}
                    className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-300 active:bg-white/5"
                  >
                    <Icon name="x" size={22} />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
