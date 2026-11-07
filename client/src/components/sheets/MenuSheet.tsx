import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import type { TableModel } from '../../lib/model';
import { act, actOk } from '../../lib/socket';
import { getPrefs, savePrefs } from '../../lib/storage';
import { useChat } from '../../store/chat';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export function MenuSheet({
  open,
  onClose,
  m,
  onRankings,
  onLog,
  onHost,
}: {
  open: boolean;
  onClose: () => void;
  m: TableModel;
  onRankings: () => void;
  onLog: () => void;
  onHost: () => void;
}) {
  const navigate = useNavigate();
  const [hints, setHints] = useState(getPrefs().hints);
  const muted = useChat((s) => s.muted);
  const setMuted = useChat((s) => s.setMuted);
  const r = m.round;
  const inRound = !!r && r.phase !== 'ENDED';
  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.menu.title}
      eyebrow={`${t.menu.code} ${m.pub.code}`}
    >
      <div className="flex flex-col gap-2">
        {m.isHost && (
          <Button variant="ivory" size="lg" block onClick={() => go(onHost)}>
            {t.menu.hostTools}
          </Button>
        )}
        <Button icon="ranks" block onClick={() => go(onRankings)}>
          {t.menu.rankings}
        </Button>
        <Button icon="log" block onClick={() => go(onLog)}>
          {t.menu.log}
        </Button>
        <label className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl bg-panel px-4">
          <span className="text-[15px] font-semibold">{t.menu.hints}</span>
          <input
            type="checkbox"
            checked={hints}
            onChange={(e) => {
              setHints(e.target.checked);
              savePrefs({ ...getPrefs(), hints: e.target.checked });
            }}
            className="h-6 w-6 accent-[#F4F1EA]"
          />
        </label>
        <label className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl bg-panel px-4">
          <span className="text-[15px] font-semibold">{t.menu.muteChat}</span>
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => setMuted(e.target.checked)}
            className="h-6 w-6 accent-[#F4F1EA]"
          />
        </label>
        {inRound && !m.isHost && (
          <Button icon="undo" block onClick={() => go(() => void act('undo:request', {}))}>
            {t.menu.requestUndo}
          </Button>
        )}
        {!m.isHost && (
          <Button
            icon="door"
            variant="danger"
            block
            onClick={() => {
              if (!window.confirm(t.menu.leaveConfirm)) return;
              void actOk('game:leave', {}).then((ok) => {
                if (ok) navigate('/');
              });
            }}
          >
            {t.menu.leave}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
