import { t } from '../../i18n';
import { describeEvent } from '../../lib/events';
import { clock } from '../../lib/format';
import type { TableModel } from '../../lib/model';
import { Sheet } from '../ui/Sheet';

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
    .map((e, i) => ({ key: `${e.at}-${i}`, at: e.at, text: describeEvent(e.event, m.nameOf) }))
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
              <span className="leading-5">{r.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
