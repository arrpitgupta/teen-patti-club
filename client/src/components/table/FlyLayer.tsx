import type { LogEntry } from '@tpc/shared';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { TableModel } from '../../lib/model';
import { Chip } from '../ui/Chips';
import { CardBack } from '../ui/PlayingCard';

interface Point {
  x: number;
  y: number;
}

interface Flight {
  id: number;
  kind: 'chip' | 'card';
  from: Point;
  to: Point;
  delay: number;
}

const CENTRE: Point = { x: 50, y: 50 };
/** You sit below the oval. */
const ME_SPOT: Point = { x: 50, y: 106 };
const keyOf = (e: LogEntry) => `${e.at}|${JSON.stringify(e.event)}`;
let nextId = 0;

/**
 * Chips fly to the pot on every bet, the pot flies to the winner, and cards are dealt out to
 * the seats. Decoration only: driven by the log, never by local guesses. Off with reduced motion.
 */
export function FlyLayer({
  m,
  spots,
  onWin,
}: {
  m: TableModel;
  spots: { id: string; x: number; y: number }[];
  onWin: () => void;
}) {
  const reduce = useReducedMotion();
  const seen = useRef<Set<string> | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    const log = m.pub.log;
    if (!seen.current) {
      // First render: everything already happened.
      seen.current = new Set(log.map(keyOf));
      return;
    }
    const fresh = log.filter((e) => !seen.current!.has(keyOf(e)));
    for (const e of fresh) seen.current.add(keyOf(e));
    if (seen.current.size > 400) seen.current = new Set(log.map(keyOf));
    if (reduce || fresh.length === 0) return;

    const at = (id: string): Point =>
      id === m.meId ? ME_SPOT : (spots.find((s) => s.id === id) ?? CENTRE);
    const add: Flight[] = [];
    for (const { event: ev } of fresh) {
      if (ev.type === 'BET' || ev.type === 'SIDESHOW_REQUESTED' || ev.type === 'SHOW_REQUESTED') {
        add.push({ id: nextId++, kind: 'chip', from: at(ev.playerId), to: CENTRE, delay: 0 });
      } else if (ev.type === 'ROUND_STARTED' && m.mode === 'digital') {
        ev.playerIds.forEach((id, i) => {
          for (let k = 0; k < 3; k++) {
            add.push({
              id: nextId++,
              kind: 'card',
              from: CENTRE,
              to: at(id),
              delay: (k * ev.playerIds.length + i) * 0.06,
            });
          }
        });
      } else if (ev.type === 'ROUND_ENDED' && ev.result.reason !== 'cancelled') {
        for (const w of ev.result.winnerIds) {
          for (let k = 0; k < 6; k++) {
            add.push({
              id: nextId++,
              kind: 'chip',
              from: CENTRE,
              to: at(w),
              delay: 0.25 + k * 0.07,
            });
          }
        }
        if (ev.result.winnerIds.includes(m.meId)) onWin();
      }
    }
    if (add.length) setFlights((f) => [...f, ...add].slice(-60));
  }, [m.pub.log, m.meId, m.mode, spots, reduce, onWin]);

  const done = (id: number) => setFlights((f) => f.filter((x) => x.id !== id));

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      <AnimatePresence>
        {flights.map((f) => (
          <motion.div
            key={f.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            initial={{ left: `${f.from.x}%`, top: `${f.from.y}%`, opacity: 0, scale: 0.7 }}
            animate={{
              left: `${f.to.x}%`,
              top: `${f.to.y}%`,
              opacity: [0, 1, 1, 0.9],
              scale: 1,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: f.kind === 'card' ? 0.32 : 0.45,
              delay: f.delay,
              ease: 'easeOut',
            }}
            onAnimationComplete={() => done(f.id)}
          >
            {f.kind === 'chip' ? <Chip amount={10} size={18} /> : <CardBack size="xs" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
