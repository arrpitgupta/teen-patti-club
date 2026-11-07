import type { Settings } from '@tpc/shared';
import { useState } from 'react';
import { t } from '../../i18n';
import { chips, net } from '../../lib/format';
import type { TableModel } from '../../lib/model';
import { act, actOk } from '../../lib/socket';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { PresetBar } from '../settings/PresetBar';
import { SettingsForm, useSettingsDraft } from '../settings/SettingsForm';

type View = 'main' | 'adjust' | 'rules' | 'offline' | 'end';

export function HostSheet({
  open,
  onClose,
  m,
}: {
  open: boolean;
  onClose: () => void;
  m: TableModel;
}) {
  const [view, setView] = useState<View>('main');
  const close = () => {
    setView('main');
    onClose();
  };
  const r = m.round;
  const between = !r || r.phase === 'ENDED';
  const inLobby = m.pub.status === 'lobby';
  const buyIn = m.pub.table.settings.chipMode === 'buyIn';
  const others = m.pub.players.filter((p) => p.present && p.id !== m.meId);

  if (view === 'adjust') return <AdjustSheet open={open} onClose={() => setView('main')} m={m} />;
  if (view === 'rules') return <RulesSheet open={open} onClose={() => setView('main')} m={m} />;
  if (view === 'offline') return <OfflineSeatSheet open={open} onClose={() => setView('main')} />;

  return (
    <Sheet open={open} onClose={close} title={t.host.title} tall>
      {view === 'end' ? (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed">{t.host.endConfirm}</p>
          {!between && <p className="text-sm text-ink-300">{t.host.endMidRound}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => setView('main')}>{t.common.cancel}</Button>
            <Button
              variant="ivory"
              onClick={() => {
                close();
                void act('game:end', {});
              }}
            >
              {t.host.endGame}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!inLobby && between && (
            <Button
              variant="ivory"
              size="lg"
              block
              onClick={() => {
                close();
                void act('round:start', {});
              }}
            >
              {t.host.nextRound}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {!inLobby && (
              <Button
                icon={m.pub.paused ? 'play' : 'pause'}
                onClick={() => void act('host:pause', { paused: !m.pub.paused })}
              >
                {m.pub.paused ? t.host.resume : t.host.pause}
              </Button>
            )}
            <Button disabled={!between} onClick={() => setView('rules')}>
              {t.host.editRules}
            </Button>
            <Button icon="plus" onClick={() => setView('offline')}>
              {t.host.addOffline}
            </Button>
            <Button onClick={() => setView('adjust')}>{t.host.adjust}</Button>
          </div>
          {!between && <p className="text-xs text-ink-500">{t.host.rulesBetweenRounds}</p>}

          <h3 className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
            {t.host.players}
          </h3>
          <ul className="flex flex-col gap-2">
            {others.map((p) => {
              const rp = m.rpOf(p.id);
              const canKick = between || rp?.packed || !rp;
              const amount = m.openTab ? net(p.balance - p.totalBuyIn) : chips(p.balance);
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 rounded-2xl bg-panel p-2.5"
                >
                  <Avatar
                    id={p.id}
                    name={p.name}
                    avatar={p.avatar}
                    size={36}
                    dim={!p.isOffline && !p.connected}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    <span className="tabular text-xs text-ink-300">
                      {amount}
                      {p.isOffline
                        ? ` · ${t.table.offlineSeat}`
                        : !p.connected
                          ? ` · ${t.table.reconnecting}`
                          : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {buyIn && between && (
                      <Button size="sm" onClick={() => void act('host:rebuy', { playerId: p.id })}>
                        {t.host.rebuy(m.pub.table.settings.startingChips)}
                      </Button>
                    )}
                    {!p.isOffline && (
                      <Button
                        size="sm"
                        onClick={() => void act('host:transfer', { playerId: p.id })}
                      >
                        {t.host.makeHost}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!canKick}
                      onClick={() => {
                        if (window.confirm(t.host.kickConfirm(p.name)))
                          void act('host:kick', { playerId: p.id });
                      }}
                    >
                      {t.host.kick}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {!inLobby && (
            <Button
              variant="danger"
              size="lg"
              block
              className="mt-2"
              onClick={() => setView('end')}
            >
              {t.host.endGame}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function AdjustSheet({ open, onClose, m }: { open: boolean; onClose: () => void; m: TableModel }) {
  const r = m.round;
  const inRound = !!r && r.phase !== 'ENDED';
  const sides = [
    ...(inRound ? [{ id: 'pot', name: t.host.pot }] : []),
    ...(inRound
      ? r.players.map((p) => ({ id: p.id, name: m.nameOf(p.id) }))
      : m.pub.players.map((p) => ({ id: p.id, name: m.nameOf(p.id) }))),
  ];
  const [from, setFrom] = useState(sides[1]?.id ?? sides[0]?.id ?? '');
  const [to, setTo] = useState(sides[0]?.id ?? '');
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('');
  const valid = from !== to && amount > 0 && reason.trim().length > 0;
  const select = 'min-h-[48px] w-full rounded-xl bg-panel px-3 text-[16px] font-semibold';

  return (
    <Sheet open={open} onClose={onClose} title={t.host.adjustTitle}>
      <p className="-mt-2 text-sm text-ink-300">{t.host.adjustHint}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.host.from}
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={select}>
            {sides.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
          {t.host.to}
          <select value={to} onChange={(e) => setTo(e.target.value)} className={select}>
            {sides.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
        {t.host.amount}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
          className={select}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
        {t.host.reason}
        <input
          value={reason}
          maxLength={140}
          onChange={(e) => setReason(e.target.value)}
          className={select}
        />
      </label>
      <Button
        variant="ivory"
        size="lg"
        disabled={!valid}
        onClick={async () => {
          const ok = await actOk('host:adjustChips', { from, to, amount, reason: reason.trim() });
          if (ok) onClose();
        }}
      >
        {t.host.adjust}
      </Button>
    </Sheet>
  );
}

function RulesSheet({ open, onClose, m }: { open: boolean; onClose: () => void; m: TableModel }) {
  const draft = useSettingsDraft(m.pub.table.settings);
  return (
    <Sheet open={open} onClose={onClose} title={t.host.editRules} tall>
      <PresetBar s={draft.s} setS={draft.setS} lockChips={m.pub.table.roundNumber > 0} />
      <SettingsForm s={draft.s} setS={draft.setS} lockChips={m.pub.table.roundNumber > 0} />
      {draft.error && <p className="text-sm text-down">{draft.error}</p>}
      <Button
        variant="ivory"
        size="lg"
        disabled={!draft.valid}
        onClick={async () => {
          const ok = await actOk('game:updateSettings', { settings: draft.s as Settings });
          if (ok) onClose();
        }}
      >
        {t.common.save}
      </Button>
    </Sheet>
  );
}

function OfflineSeatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={t.host.addOffline}>
      <input
        value={name}
        maxLength={20}
        placeholder={t.host.offlineName}
        onChange={(e) => setName(e.target.value)}
        className="min-h-[48px] rounded-xl bg-panel px-3.5 text-[16px] font-semibold"
      />
      <Button
        variant="ivory"
        size="lg"
        disabled={name.trim().length === 0}
        onClick={async () => {
          const ok = await actOk('host:addOfflineSeat', { name: name.trim(), avatar: 'initials' });
          if (ok) {
            setName('');
            onClose();
          }
        }}
      >
        {t.host.addOffline}
      </Button>
    </Sheet>
  );
}
