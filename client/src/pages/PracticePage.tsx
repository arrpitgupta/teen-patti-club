import { useEffect, useMemo } from 'react';
import { buildModel } from '../lib/model';
import { getProfile } from '../lib/storage';
import { BOTS } from '../practice/bots';
import { LOCAL_CODE, ME, startLocalGame, stopLocalGame } from '../practice/localGame';
import { useGame } from '../store/game';
import { t } from '../i18n';
import Results from './Results';
import TableScreen from './TableScreen';

/** Practice: a digital game against 3 bots, entirely on this phone. */
export default function PracticePage() {
  const pub = useGame((s) => s.pub);
  const priv = useGame((s) => s.priv);

  useEffect(() => {
    const profile = getProfile();
    startLocalGame({
      label: t.practice.badge,
      bots: BOTS.slice(0, 3),
      name: profile?.name ?? t.common.you,
      avatar: profile?.avatar ?? 'initials',
    });
    return () => stopLocalGame();
  }, []);

  const model = useMemo(
    () => (pub && pub.code === LOCAL_CODE ? buildModel(pub, priv, ME) : null),
    [pub, priv],
  );
  if (!model) return null;
  if (model.pub.status === 'ended') return <Results m={model} />;
  return <TableScreen m={model} />;
}
