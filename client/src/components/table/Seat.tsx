import type { PublicPlayer, PublicRoundPlayer } from '@tpc/shared';
import { t } from '../../i18n';
import { chips, net } from '../../lib/format';
import { SeatFloat } from '../chat/SeatFloat';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { StatusPill, type SeatStatus } from '../ui/StatusPill';

export interface SeatProps {
  player: PublicPlayer;
  rp: PublicRoundPlayer | undefined;
  roundRunning: boolean;
  isTurn: boolean;
  overdue: boolean;
  /** 0..1 of the turn timer left, when this seat is acting. */
  timerLeft: number | null;
  compact: boolean;
  openTab: boolean;
  sittingOut: boolean;
  isHost: boolean;
  /** "Away": sits out upcoming rounds. */
  away: boolean;
}

function statusOf(p: SeatProps): SeatStatus | null {
  if (p.overdue) return 'waiting';
  if (!p.player.isOffline && !p.player.connected) return 'reconnecting';
  if (p.rp && p.roundRunning) return p.rp.status;
  if (p.away) return 'away';
  if (p.rp) return p.rp.status;
  if (p.roundRunning) return 'sittingOut';
  if (p.player.isOffline) return 'offline';
  return null;
}

export function Seat(props: SeatProps) {
  const { player, rp, isTurn, overdue, timerLeft, compact, openTab } = props;
  const status = statusOf(props);
  const size = compact ? 42 : 48;
  const dim = rp?.packed || (props.roundRunning && !rp);
  const amount = openTab ? player.balance - player.totalBuyIn : player.balance;
  const amountText = openTab ? net(amount) : chips(amount);
  const amountColor = openTab
    ? amount > 0
      ? 'text-up'
      : amount < 0
        ? 'text-down'
        : 'text-ink-300'
    : 'text-ink-100';
  const ringColor = '#ECC66A';
  const circumference = 2 * Math.PI * (size / 2 + 5);

  return (
    <div
      className={`flex flex-col items-center ${compact ? 'w-[76px]' : 'w-[96px]'} ${dim ? 'opacity-60' : ''}`}
      aria-label={[
        player.name,
        amountText,
        status ? (status === 'waiting' ? t.table.waiting : status) : '',
        isTurn ? t.table.turnOf(player.name) : '',
      ].join(', ')}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {isTurn && !overdue && (
          <svg
            width={size + 12}
            height={size + 12}
            viewBox={`0 0 ${size + 12} ${size + 12}`}
            aria-hidden="true"
            className="absolute -left-1.5 -top-1.5"
          >
            <circle
              cx={(size + 12) / 2}
              cy={(size + 12) / 2}
              r={size / 2 + 5}
              fill="none"
              stroke="rgba(236,198,106,0.22)"
              strokeWidth={3}
            />
            <circle
              cx={(size + 12) / 2}
              cy={(size + 12) / 2}
              r={size / 2 + 5}
              fill="none"
              stroke={ringColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (timerLeft ?? 1))}
              transform={`rotate(-90 ${(size + 12) / 2} ${(size + 12) / 2})`}
            />
          </svg>
        )}
        <Avatar
          id={player.id}
          name={player.name}
          avatar={player.avatar}
          size={size}
          dim={!player.isOffline && !player.connected}
          ring={overdue ? 'overdue' : isTurn ? 'turn' : null}
        />
        {overdue && (
          <span className="absolute -bottom-1 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-overdue text-felt-950">
            <Icon name="clock" size={14} strokeWidth={2.6} />
          </span>
        )}
        {!overdue && !player.isOffline && !player.connected && (
          <span className="absolute -right-1.5 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink-100 text-felt-950">
            <Icon name="wifiOff" size={12} strokeWidth={2.6} />
          </span>
        )}
        {props.isHost && (
          <span
            className="absolute -left-1.5 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-felt-900 text-ink-100 shadow-[0_0_0_1.5px_#C9C4B8]"
            aria-label={t.common.host}
          >
            <Icon name="crown" size={11} strokeWidth={2.4} />
          </span>
        )}
        <SeatFloat playerId={player.id} />
      </div>
      {compact ? (
        <>
          {status && (
            <span className="relative -mt-2">
              <StatusPill status={status} />
            </span>
          )}
          <span
            className={`mt-0.5 max-w-full truncate text-xs font-semibold ${isTurn ? 'text-gold-400' : ''}`}
          >
            {player.name}
          </span>
          <span className={`tabular text-xs font-semibold ${amountColor}`}>{amountText}</span>
        </>
      ) : (
        <>
          <span
            className={`mt-1 max-w-full truncate text-[13px] font-semibold ${isTurn ? 'text-gold-400' : ''}`}
          >
            {player.name}
          </span>
          <span className={`tabular text-[13px] font-semibold ${amountColor}`}>{amountText}</span>
          {status && (
            <span className="mt-0.5">
              <StatusPill status={status} />
            </span>
          )}
        </>
      )}
    </div>
  );
}
