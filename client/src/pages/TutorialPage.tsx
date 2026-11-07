import { useEffect, useMemo } from 'react';
import { TutorialCoach } from '../components/learn/TutorialCoach';
import { t } from '../i18n';
import { buildModel } from '../lib/model';
import { getProfile, getPrefs, savePrefs } from '../lib/storage';
import { LOCAL_CODE, ME, startLocalGame, stopLocalGame } from '../practice/localGame';
import { TUTORIAL_BOTS, tutorialHooks } from '../practice/tutorial';
import { useGame } from '../store/game';
import TableScreen from './TableScreen';

/** The interactive tutorial: a scripted round with a coach, on this phone. */
export default function TutorialPage() {
  const pub = useGame((s) => s.pub);
  const priv = useGame((s) => s.priv);

  useEffect(() => {
    const profile = getProfile();
    // The coach explains everything; the table hints would repeat it.
    const prefs = getPrefs();
    savePrefs({ ...prefs, hints: false });
    startLocalGame({
      label: t.tutorial.title,
      bots: TUTORIAL_BOTS,
      name: profile?.name ?? t.common.you,
      avatar: profile?.avatar ?? 'initials',
      settings: { boot: 10, potLimit: null, maxChaal: null, maxBlinds: null },
      hooks: tutorialHooks(),
      botDelayMs: 1300,
    });
    return () => {
      stopLocalGame();
      savePrefs({ ...getPrefs(), hints: prefs.hints });
    };
  }, []);

  const model = useMemo(
    () => (pub && pub.code === LOCAL_CODE ? buildModel(pub, priv, ME) : null),
    [pub, priv],
  );
  if (!model) return null;
  return (
    <>
      <TableScreen m={model} />
      <TutorialCoach m={model} />
    </>
  );
}
