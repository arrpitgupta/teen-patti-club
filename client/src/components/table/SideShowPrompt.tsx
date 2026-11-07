import { t } from '../../i18n';
import type { TableModel } from '../../lib/model';
import { act } from '../../lib/socket';
import { Avatar } from '../ui/Avatar';
import { Sheet } from '../ui/Sheet';

/** Shown to the player who was asked for a side show (or the host answering for them). */
export function SideShowPrompt({ m }: { m: TableModel }) {
  const r = m.round;
  const open = !!r && m.legal.canRespondSideShow && !!r.pendingSideShow;
  const requester = r?.pendingSideShow ? m.playerOf(r.pendingSideShow.requesterId) : undefined;
  const actAs = m.actingForOther ? { actAs: m.actorId } : {};
  const answer = (accept: boolean) => void act('action:sideshowRespond', { accept, ...actAs });

  return (
    <Sheet
      open={open}
      dismissible={false}
      eyebrow={m.actingForOther ? t.physical.answeringFor(m.nameOf(m.actorId)) : t.actions.sideShow}
      title={requester ? t.sideShow.asks(requester.name) : ''}
    >
      {requester && (
        <div className="flex items-center gap-3">
          <Avatar id={requester.id} name={requester.name} avatar={requester.avatar} size={52} />
          <p className="text-[15px] leading-relaxed text-ink-300">{t.sideShow.explain}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => answer(false)}
          className="min-h-[56px] rounded-2xl bg-panel text-base font-semibold"
        >
          {t.actions.deny}
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className="min-h-[56px] rounded-2xl bg-gold-500 font-display text-base font-bold text-gold-ink"
        >
          {t.actions.accept}
        </button>
      </div>
    </Sheet>
  );
}
