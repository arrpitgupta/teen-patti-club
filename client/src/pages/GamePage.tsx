import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { t } from '../i18n';
import { startKeepAlive } from '../lib/config';
import { buildModel } from '../lib/model';
import { autoSubscribe } from '../lib/push';
import { getSocket, reconnect } from '../lib/socket';
import { forgetSeat, getSeat } from '../lib/storage';
import { useGame } from '../store/game';
import LobbyRoom from './LobbyRoom';
import Results from './Results';
import TableScreen from './TableScreen';

export default function GamePage() {
  const code = (useParams().code ?? '').toUpperCase();
  const seat = getSeat(code);
  const enterGame = useGame((s) => s.enterGame);
  const pub = useGame((s) => s.pub);
  const priv = useGame((s) => s.priv);
  const kicked = useGame((s) => s.kicked);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    if (!seat) return;
    enterGame(code, seat.playerId);
    const socket = getSocket();
    // If already connected, attach now; otherwise the socket's connect handler does it.
    if (socket.connected) {
      void reconnect(code, seat.playerToken).then((ack) => {
        if (!ack.ok && (ack.error.code === 'BAD_TOKEN' || ack.error.code === 'GAME_NOT_FOUND')) {
          forgetSeat(code);
          setFatal(ack.error.message);
        }
      });
    }
  }, [code, seat?.playerToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once this phone is seated in the game: resubscribe to "your turn" pushes if allowed.
  const joined = pub?.code === code && pub.status !== 'ended';
  // Keep the (free-plan) server awake while this game is open.
  useEffect(() => (joined ? startKeepAlive() : undefined), [joined]);
  useEffect(() => {
    if (joined) void autoSubscribe();
  }, [joined, code]);

  const model = useMemo(
    () => (pub && seat && pub.code === code ? buildModel(pub, priv, seat.playerId) : null),
    [pub, priv, seat, code],
  );

  if (!seat) return <Navigate to={`/join/${code}`} replace />;

  if (fatal || kicked) {
    return (
      <main className="screen items-center justify-center gap-4 px-6 text-center">
        <p className="text-[17px]">{kicked ? t.events.kickedYou : fatal}</p>
        <Link
          to="/"
          className="flex min-h-[52px] items-center rounded-2xl bg-ink-100 px-6 font-bold text-felt-950"
        >
          {t.results.home}
        </Link>
      </main>
    );
  }

  if (!model) {
    return (
      <main className="screen items-center justify-center">
        <p role="status" className="animate-pulse text-ink-300">
          {t.home.waking}
        </p>
      </main>
    );
  }

  if (model.pub.status === 'lobby') return <LobbyRoom m={model} />;
  if (model.pub.status === 'ended') return <Results m={model} />;
  return <TableScreen m={model} />;
}
