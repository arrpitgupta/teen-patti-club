import { useEffect, useState } from 'react';
import { useGame } from '../store/game';

/** Current server time (ms), refreshed every `intervalMs`. */
export function useServerNow(intervalMs = 250): number {
  const offset = useGame((s) => s.clockOffset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now + offset;
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Tablet / desktop landscape: wide oval table with the hand and action bar side by side. */
export function useWideLayout(): boolean {
  return useMediaQuery('(min-width: 900px) and (orientation: landscape)');
}
