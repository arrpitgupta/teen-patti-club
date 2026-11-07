import type { Card, GameLogEvent } from '@tpc/shared';
import { t } from '../../i18n';
import { describeEvent } from '../../lib/events';
import { clock } from '../../lib/format';
import type { TableModel } from '../../lib/model';
import { CardFace } from '../ui/PlayingCard';
import { Sheet } from '../ui/Sheet';

/** Hands revealed to everyone by this event (show, pot-limit show, "Show my cards"). */
function handsOf(e: GameLogEvent): [string, Card[]][] {
  if (e.type === 'ROUND_ENDED') return Object.entries(e.result.revealedHands);
  if (e.type === 'HAND_SHOWN') return [[e.playerId, e.cards]];
  return [];
}

export function LogSheet({
  open,
  onClose,
  m,
}: {
  open: boolean;
  onClose: () => void;
  m: TableModel;
}) {
  const rows = [...m.pub.log]
    .reverse()
    .map((e, i) => ({
      key: `${e.at}-${i}`,
      at: e.at,
      text: describeEvent(e.event, m.nameOf),
      hands: handsOf(e.event),
    }))
    .filter((r) => r.text);
  return (
    <Sheet open={open} onClose={onClose} title={t.log.title} tall>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-300">{t.log.empty}</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((r) => (
            <li key={r.key} className="flex gap-3 border-b border-ink-100/[0.06] py-2.5 text-sm">
              <span className="tabular w-[72px] shrink-0 text-xs leading-5 text-ink-500">
                {clock(r.at)}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="leading-5">{r.text}</span>
                {r.hands.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {r.hands.map(([id, cards]) => (
                      <span key={id} className="flex items-center gap-1.5">
                        <span className="text-xs text-ink-300">{m.nameOf(id)}</span>
                        <span className="flex gap-0.5">
                          {cards.map((c) => (
                            <CardFace key={c} card={c} size="xs" />
                          ))}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
