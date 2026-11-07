import { t } from '../../i18n';
import { Icon } from './Icon';

export type SeatStatus =
  'blind' | 'seen' | 'packed' | 'waiting' | 'reconnecting' | 'sittingOut' | 'offline' | 'away';

const BASE = 'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs';

export function StatusPill({ status }: { status: SeatStatus }) {
  switch (status) {
    case 'seen':
      return (
        <span className={`${BASE} bg-ink-100 font-bold text-felt-950`}>
          <Icon name="eye" size={12} strokeWidth={2.6} />
          {t.table.seen}
        </span>
      );
    case 'blind':
      return (
        <span className={`${BASE} bg-[#17402C] font-semibold text-ink-300`}>
          <Icon name="eyeOff" size={12} strokeWidth={2.4} />
          {t.table.blind}
        </span>
      );
    case 'packed':
      return (
        <span
          className={`${BASE} bg-[#2A3A31] font-semibold text-ink-100 shadow-[inset_0_0_0_1px_#8D897F]`}
        >
          <Icon name="x" size={12} strokeWidth={2.6} />
          {t.table.packed}
        </span>
      );
    case 'waiting':
      return (
        <span className={`${BASE} bg-overdue font-bold text-felt-950`}>{t.table.waiting}</span>
      );
    case 'reconnecting':
      return (
        <span className={`${BASE} bg-[#2A3A31] font-semibold text-ink-100`}>
          {t.table.reconnecting}
        </span>
      );
    case 'sittingOut':
      return (
        <span className={`${BASE} bg-[#2A3A31] font-semibold text-ink-100`}>
          {t.table.sittingOut}
        </span>
      );
    case 'away':
      return (
        <span
          className={`${BASE} bg-[#2A3A31] font-semibold text-ink-100 shadow-[inset_0_0_0_1px_#8D897F]`}
        >
          <Icon name="pause" size={12} strokeWidth={2.6} />
          {t.table.away}
        </span>
      );
    case 'offline':
      return (
        <span className={`${BASE} bg-[#2A3A31] font-semibold text-ink-300`}>
          {t.table.offlineSeat}
        </span>
      );
  }
}
