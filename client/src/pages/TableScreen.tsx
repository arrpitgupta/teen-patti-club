import { useEffect, useState } from 'react';
import { ChatDrawer } from '../components/chat/ChatDrawer';
import { ChatButton } from '../components/chat/SeatFloat';
import { ComparisonSheet } from '../components/physical/ComparisonSheet';
import { HostSheet } from '../components/sheets/HostSheet';
import { LogSheet } from '../components/sheets/LogSheet';
import { MenuSheet } from '../components/sheets/MenuSheet';
import { RankingsSheet } from '../components/sheets/RankingsSheet';
import { ActionDock } from '../components/table/ActionDock';
import { Banners } from '../components/table/Banners';
import { TableView } from '../components/table/TableView';
import { YourHand } from '../components/table/YourHand';
import { IconButton } from '../components/ui/Button';
import { t } from '../i18n';
import type { TableModel } from '../lib/model';
import { useWideLayout } from '../lib/useNow';
import { LOCAL_CODE, localLabel } from '../practice/localGame';
import { useChat } from '../store/chat';
import { useGame } from '../store/game';

type SheetName = 'menu' | 'rankings' | 'log' | 'host' | null;

export default function TableScreen({ m }: { m: TableModel }) {
  const wide = useWideLayout();
  const [sheet, setSheet] = useState<SheetName>(null);
  useEffect(() => {
    useGame.setState({ inlineToasts: true });
    return () => {
      useGame.setState({ inlineToasts: false });
      useChat.getState().setOpen(false);
    };
  }, []);
  const close = () => setSheet(null);
  const s = m.pub.table.settings;
  const r = m.round;

  const topBar = (
    <header className="flex h-14 shrink-0 items-center justify-between px-1.5">
      <IconButton icon="menu" label={t.menu.title} onClick={() => setSheet('menu')} />
      <div className="flex flex-col items-center leading-tight">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
          {r ? `${t.table.round(r.roundNumber)} · ` : ''}
          {s.mode === 'physical' ? t.create.physical : t.create.digital}
          {wide && ` · ${s.chipMode === 'openTab' ? t.create.openTab : t.create.buyIn}`}
        </span>
        <span className="text-sm font-semibold tracking-[0.08em]">
          {m.pub.code === LOCAL_CODE ? localLabel : m.pub.code}
        </span>
      </div>
      <div className="flex">
        <ChatButton m={m} />
        <IconButton icon="log" label={t.menu.log} onClick={() => setSheet('log')} />
        {m.isHost ? (
          <IconButton icon="crown" label={t.menu.hostTools} onClick={() => setSheet('host')} />
        ) : (
          <IconButton icon="ranks" label={t.menu.rankings} onClick={() => setSheet('rankings')} />
        )}
      </div>
    </header>
  );

  const sheets = (
    <>
      <ComparisonSheet m={m} />
      <MenuSheet
        open={sheet === 'menu'}
        onClose={close}
        m={m}
        onRankings={() => setSheet('rankings')}
        onLog={() => setSheet('log')}
        onHost={() => setSheet('host')}
      />
      <RankingsSheet
        open={sheet === 'rankings'}
        onClose={close}
        hand={m.priv?.hand ?? null}
        a23Rank={s.a23Rank}
      />
      <LogSheet open={sheet === 'log'} onClose={close} m={m} />
      <ChatDrawer m={m} wide={wide} />
      {m.isHost && <HostSheet open={sheet === 'host'} onClose={close} m={m} />}
    </>
  );

  if (wide) {
    return (
      <div className="screen h-dvh overflow-hidden">
        {topBar}
        <Banners m={m} />
        <div className="min-h-0 flex-1 px-6 py-2">
          <TableView m={m} wide />
        </div>
        <div className="grid shrink-0 grid-cols-[minmax(320px,420px)_minmax(0,1fr)] items-end gap-5 px-6 pb-4">
          <div className="rounded-[20px] bg-felt-900 px-2 pb-4 pt-12">
            <YourHand m={m} wide onRankings={() => setSheet('rankings')} />
          </div>
          <div className="overflow-hidden rounded-[20px]">
            <ActionDock m={m} wide />
          </div>
        </div>
        {sheets}
      </div>
    );
  }

  return (
    <div className="screen h-dvh overflow-hidden">
      {topBar}
      <Banners m={m} />
      <div className="min-h-0 flex-1 px-1">
        <TableView m={m} wide={false} />
      </div>
      <div className="shrink-0 pb-3 pt-12">
        <YourHand m={m} wide={false} onRankings={() => setSheet('rankings')} />
      </div>
      <div className="shrink-0">
        <ActionDock m={m} wide={false} />
      </div>
      {sheets}
    </div>
  );
}
