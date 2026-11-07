import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Walkthrough } from '../components/learn/Walkthrough';
import { RankingsSheet } from '../components/sheets/RankingsSheet';
import { Icon, type IconName } from '../components/ui/Icon';
import { t } from '../i18n';
import { getPrefs, savePrefs } from '../lib/storage';

function Row({
  icon,
  title,
  hint,
  onClick,
  to,
  primary = false,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onClick?: () => void;
  to?: string;
  primary?: boolean;
}) {
  const cls = `flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl px-4 text-left ${primary ? 'bg-ink-100 text-felt-950' : 'bg-panel'}`;
  const body = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-felt-950 text-ink-100' : 'bg-ink-100/[0.08]'}`}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-bold">{title}</span>
        <span className={`text-[13px] ${primary ? 'text-felt-800' : 'text-ink-300'}`}>{hint}</span>
      </span>
      <Icon name="arrowRight" size={18} />
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** Learning hub: walkthrough, tutorial, practice, rankings, glossary. */
export default function LearnPage() {
  const navigate = useNavigate();
  const [how, setHow] = useState(false);
  const [ranks, setRanks] = useState(false);

  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 pb-8">
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </button>
          <h1 className="font-display text-2xl font-bold">{t.learn.title}</h1>
        </header>
        <p className="-mt-2 text-[15px] text-ink-300">{t.learn.subtitle}</p>
        <div className="flex flex-col gap-2.5">
          <Row
            icon="info"
            title={t.learn.how}
            hint={t.learn.howHint}
            onClick={() => setHow(true)}
          />
          <Row
            icon="play"
            title={t.learn.tutorial}
            hint={t.learn.tutorialHint}
            to="/tutorial"
            primary
          />
          <Row icon="users" title={t.learn.practice} hint={t.learn.practiceHint} to="/practice" />
          <Row
            icon="ranks"
            title={t.learn.rankings}
            hint={t.learn.rankingsHint}
            onClick={() => setRanks(true)}
          />
          <Row
            icon="log"
            title={t.learn.glossary}
            hint={t.learn.glossaryHint}
            to="/learn/glossary"
          />
        </div>
      </div>
      {how && (
        <Walkthrough
          onDone={() => {
            savePrefs({ ...getPrefs(), seenWalkthrough: true });
            setHow(false);
          }}
        />
      )}
      <RankingsSheet open={ranks} onClose={() => setRanks(false)} hand={null} a23Rank="second" />
    </main>
  );
}

export function GlossaryPage() {
  const navigate = useNavigate();
  return (
    <main className="screen px-5 py-4">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-8">
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/learn')}
            aria-label={t.common.back}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-300"
          >
            <Icon name="arrowLeft" size={22} />
          </button>
          <h1 className="font-display text-2xl font-bold">{t.glossary.title}</h1>
        </header>
        <dl className="flex flex-col divide-y divide-ink-100/[0.08] rounded-2xl bg-panel px-4">
          {t.glossary.terms.map(([term, def]) => (
            <div key={term} className="flex flex-col gap-0.5 py-3">
              <dt className="text-[15px] font-bold">{term}</dt>
              <dd className="text-[14px] leading-snug text-ink-300">{def}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
