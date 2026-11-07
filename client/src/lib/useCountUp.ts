import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/** Animates a number from its previous value to `value` (balances, nets). */
export function useCountUp(value: number, durationMs = 550): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduce || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, reduce, durationMs]);

  return shown;
}
