import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { t } from '../../i18n';
import type { TableModel } from '../../lib/model';
import { unreadCount, useChat } from '../../store/chat';
import { IconButton } from '../ui/Button';

/**
 * A reaction or preset line floating over a player's avatar for ~2 s.
 * Place inside a `relative` box the size of the avatar.
 */
export function SeatFloat({ playerId }: { playerId: string }) {
  const float = useChat((s) => s.floats[playerId]);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {float && (
        <motion.div
          key={float.id}
          className="pointer-events-none absolute bottom-[55%] left-1/2 z-30 flex -translate-x-1/2 flex-col items-center"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: -6, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -22 }}
          transition={{ type: 'spring', damping: 16, stiffness: 300 }}
          aria-hidden="true"
        >
          {float.kind === 'reaction' ? (
            <span className="text-[40px] leading-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.55)]">
              {float.text}
            </span>
          ) : (
            <>
              <span className="whitespace-nowrap rounded-2xl bg-ink-100 px-3 py-1.5 text-[13px] font-bold text-felt-950 shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
                {float.text}
              </span>
              <span className="-mt-1 h-2.5 w-2.5 rotate-45 bg-ink-100" />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ChatButton({ m }: { m: TableModel }) {
  const count = useChat((s) => unreadCount(s, m.meId));
  const muted = useChat((s) => s.muted);
  const setOpen = useChat((s) => s.setOpen);
  const label = count > 0 && !muted ? `${t.chat.open}, ${t.chat.unread(count)}` : t.chat.open;
  return (
    <span className="relative">
      <IconButton icon="chat" label={label} onClick={() => setOpen(true)} />
      {count > 0 && !muted && (
        <span
          className="tabular pointer-events-none absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-100 px-1 text-xs font-bold text-felt-950 shadow-[0_0_0_2px_#04140D]"
          aria-hidden="true"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  );
}
