import { CHAT_MAX_CHARS, REACTIONS, type Ack, type ChatMessage } from '@tpc/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import type { TableModel } from '../../lib/model';
import { send } from '../../lib/socket';
import { useChat } from '../../store/chat';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * Phones: a tall bottom sheet. Tablets (wide layout): a panel on the right so the table
 * stays visible.
 */
export function ChatDrawer({ m, wide }: { m: TableModel; wide: boolean }) {
  const open = useChat((s) => s.open);
  const setOpen = useChat((s) => s.setOpen);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-40 flex ${wide ? 'justify-end' : 'items-end'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className={`absolute inset-0 ${wide ? 'bg-[rgba(2,10,6,0.35)]' : 'bg-[rgba(2,10,6,0.7)]'}`}
            onClick={close}
            aria-hidden="true"
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={t.chat.title}
            className={
              wide
                ? 'relative flex h-full w-[min(400px,40vw)] flex-col bg-felt-900 shadow-sheet'
                : 'relative flex h-[82dvh] w-full flex-col rounded-t-3xl bg-felt-900 shadow-sheet'
            }
            style={wide ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
            initial={wide ? { x: 60 } : { y: 60 }}
            animate={wide ? { x: 0 } : { y: 0 }}
            exit={wide ? { x: 80 } : { y: 80 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            {!wide && (
              <div className="mx-auto mt-2.5 h-[5px] w-10 shrink-0 rounded-full bg-ink-100/25" />
            )}
            <ChatBody m={m} wide={wide} onClose={close} />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChatBody({ m, wide, onClose }: { m: TableModel; wide: boolean; onClose: () => void }) {
  const messages = useChat((s) => s.messages);
  const muted = useChat((s) => s.muted);
  const setMuted = useChat((s) => s.setMuted);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Stay pinned to the newest message.
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const deliver = async (emit: () => Promise<Ack<unknown>>) => {
    setError(null);
    const ack = await emit();
    if (!ack.ok) setError(ack.error.message);
    return ack.ok;
  };

  // Phones: close after a one-tap send so the bubble over your seat is visible.
  const quickSend = async (emit: () => Promise<Ack<unknown>>) => {
    if ((await deliver(emit)) && !wide) onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await deliver(() => send('chat:send', { text }));
    setSending(false);
    if (ok) {
      setDraft('');
      input.current?.focus();
    }
  };

  const left = CHAT_MAX_CHARS - draft.length;

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-2">
        <h2 className="font-display text-xl font-bold">{t.chat.title}</h2>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={muted}
            className={`flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold ${muted ? 'bg-ink-100 text-felt-950' : 'text-ink-300 active:bg-white/5'}`}
          >
            <Icon name={muted ? 'bellOff' : 'bell'} size={18} />
            {muted ? t.chat.unmute : t.chat.mute}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300 active:bg-white/5"
          >
            <Icon name="x" size={22} />
          </button>
        </div>
      </header>
      {muted && (
        <p className="mx-4 mb-2 rounded-xl bg-panel px-3 py-2 text-[13px] text-ink-300">
          {t.chat.muted}
        </p>
      )}

      <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
        role="log"
        aria-live="polite"
        aria-label={t.chat.title}
      >
        {messages.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-ink-300">
            {t.chat.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {messages.map((msg, i) => (
              <MessageRow
                key={msg.id}
                m={m}
                msg={msg}
                showName={messages[i - 1]?.playerId !== msg.playerId}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-ink-100/10 pb-safe pt-3">
        <div className="flex justify-between gap-1 px-3" role="group" aria-label={t.chat.react}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void quickSend(() => send('chat:react', { emoji }))}
              aria-label={t.chat.reactionLabel(emoji)}
              className="flex h-12 flex-1 items-center justify-center rounded-xl text-[26px] active:scale-90 active:bg-white/5"
            >
              {emoji}
            </button>
          ))}
        </div>
        <div
          className="mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
          role="group"
          aria-label={t.chat.quick}
        >
          {t.chat.presets.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => void quickSend(() => send('chat:send', { text: line, quick: true }))}
              className="flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full bg-panel px-3.5 text-[13px] font-semibold active:bg-panel-raised"
            >
              {line}
            </button>
          ))}
        </div>
        {error && (
          <p className="mx-4 mt-2 text-[13px] text-down" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={(e) => void submit(e)} className="mt-2 flex items-center gap-2 px-4">
          <div className="relative flex-1">
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MAX_CHARS))}
              maxLength={CHAT_MAX_CHARS}
              placeholder={t.chat.placeholder}
              aria-label={t.chat.placeholder}
              enterKeyHint="send"
              autoComplete="off"
              className="h-12 w-full rounded-xl bg-felt-950 px-3.5 text-base text-ink-100 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-100/40"
            />
            {left <= 40 && (
              <span className="tabular absolute -top-5 right-1 text-xs text-ink-300">
                {t.chat.charsLeft(left)}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label={t.chat.send}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-felt-950 disabled:bg-panel-sunk disabled:text-ink-500"
          >
            <Icon name="send" size={20} strokeWidth={2.2} />
          </button>
        </form>
      </div>
    </>
  );
}

function MessageRow({ m, msg, showName }: { m: TableModel; msg: ChatMessage; showName: boolean }) {
  const mine = msg.playerId === m.meId;
  const p = m.playerOf(msg.playerId);
  const name = p?.name ?? '?';
  const stamp = time.format(msg.at);

  const body =
    msg.kind === 'reaction' ? (
      <span className="text-[30px] leading-none" aria-label={`${name}: ${msg.text}`}>
        {msg.text}
      </span>
    ) : (
      <span
        className={[
          'max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[15px] leading-snug',
          mine ? 'rounded-br-md bg-ink-100 text-felt-950' : 'rounded-bl-md bg-panel text-ink-100',
          msg.kind === 'quick' ? 'font-semibold italic' : '',
        ].join(' ')}
      >
        {msg.text}
      </span>
    );

  return (
    <li className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${showName ? 'mt-2' : ''}`}>
      {showName && (
        <span className="mb-1 flex items-center gap-1.5 text-xs text-ink-300">
          {!mine && p && <Avatar id={p.id} name={p.name} avatar={p.avatar} size={20} />}
          <span className="font-semibold">{mine ? t.common.you : name}</span>
          <span className="text-ink-500">{stamp}</span>
        </span>
      )}
      <span className={`flex ${mine ? 'justify-end' : 'justify-start'} w-full`} title={stamp}>
        {body}
      </span>
    </li>
  );
}
