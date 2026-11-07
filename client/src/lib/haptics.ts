// Vibration is a hint, never required: unsupported browsers (iOS Safari) simply do nothing.
function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export const haptics = {
  yourTurn: () => vibrate([60, 60, 60]),
  overdue: () => vibrate([200, 100, 200]),
  win: () => vibrate([40, 40, 40, 40, 120]),
  tap: () => vibrate(10),
  nudge: () => vibrate([90, 50, 90, 50, 90]),
};
