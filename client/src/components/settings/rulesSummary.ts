import type { Settings } from '@tpc/shared';
import { t } from '../../i18n';
import { chips } from '../../lib/format';

/** Short labels for a rules set: mode, chips, boot, timer. */
export function rulesSummary(s: Settings): string[] {
  return [
    s.mode === 'physical' ? t.create.physical : t.create.digital,
    s.chipMode === 'openTab' ? t.create.openTab : `${t.create.buyIn} ${chips(s.startingChips)}`,
    `${t.create.boot.split(' (')[0]} ${chips(s.boot)}`,
    s.turnTimerSec
      ? `${t.create.timer} ${s.turnTimerSec}s`
      : `${t.create.timer} ${t.create.timerOff.toLowerCase()}`,
  ];
}
