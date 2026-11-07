import { t } from '../../i18n';
import type { TableModel } from '../../lib/model';
import { act } from '../../lib/socket';
import { useGame } from '../../store/game';
import { Icon } from '../ui/Icon';

/** Stacked notices under the top bar: connection, undo requests, host hand-over. */
export function Banners({ m }: { m: TableModel }) {
  const connection = useGame((s) => s.connection);
  const undo = m.pub.pendingUndo;
  const offer = m.pub.hostTransferOffer;

  return (
    <div className="flex flex-col gap-2 px-3 empty:hidden">
      {connection !== 'connected' && (
        <div
          className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#2A3A31] px-3 text-sm font-semibold"
          role="status"
        >
          <Icon name="wifiOff" size={18} />
          {t.table.connectionLost}
        </div>
      )}
      {undo && m.isHost && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-panel p-2.5" role="alert">
          <span className="min-w-0 flex-1 text-sm font-semibold">
            {t.host.undoAsked(m.nameOf(undo.requestedBy))}
          </span>
          <button
            type="button"
            onClick={() => void act('undo:reject', {})}
            className="min-h-[44px] rounded-xl bg-panel-raised px-3 text-sm font-semibold"
          >
            {t.host.reject}
          </button>
          <button
            type="button"
            onClick={() => void act('undo:approve', {})}
            className="min-h-[44px] rounded-xl bg-ink-100 px-3 text-sm font-bold text-felt-950"
          >
            {t.host.approve}
          </button>
        </div>
      )}
      {undo && !m.isHost && undo.requestedBy === m.meId && (
        <div className="flex min-h-[44px] items-center gap-2 rounded-xl bg-panel px-3 text-sm">
          <Icon name="clock" size={18} />
          {t.undo.waiting}
        </div>
      )}
      {offer && offer.candidateId === m.meId && (
        <div className="flex flex-col gap-2 rounded-xl bg-panel p-3" role="alert">
          <span className="text-[15px] font-semibold">{t.host.claimTitle}</span>
          <span className="text-sm text-ink-300">{t.host.claimBody}</span>
          <button
            type="button"
            onClick={() => void act('host:claim', {})}
            className="min-h-[48px] rounded-xl bg-ink-100 text-[15px] font-bold text-felt-950"
          >
            {t.host.claim}
          </button>
        </div>
      )}
    </div>
  );
}
