import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = ['#ECC66A', '#F4F1EA', '#7FE0B0', '#FF8A80', '#D9A93F'];

/** A short confetti burst for a round win. Renders nothing with reduced motion. */
export function Confetti({ burst }: { burst: number }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        i,
        x: (Math.random() - 0.5) * 340,
        y: 260 + Math.random() * 260,
        r: (Math.random() - 0.5) * 720,
        w: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length]!,
        delay: Math.random() * 0.15,
      })),
    // A new set of pieces for every burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst],
  );
  if (reduce || burst === 0) return null;
  return (
    <div
      key={burst}
      className="pointer-events-none fixed inset-x-0 top-[30%] z-40 flex justify-center"
      aria-hidden="true"
    >
      {pieces.map((p) => (
        <motion.span
          key={p.i}
          className="absolute rounded-[2px]"
          style={{ width: p.w, height: p.w * 0.45, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: [0, -120 - Math.abs(p.x) * 0.3, p.y],
            opacity: [1, 1, 0],
            rotate: p.r,
          }}
          transition={{ duration: 1.6, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
