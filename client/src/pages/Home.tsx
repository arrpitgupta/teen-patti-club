import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { SERVER_URL } from '../lib/config';

type ServerStatus = 'waking' | 'ready' | 'offline';

export default function Home() {
  const [status, setStatus] = useState<ServerStatus>('waking');

  useEffect(() => {
    const controller = new AbortController();
    // Render free tier can take ~30 s to cold-start.
    const timeout = setTimeout(() => controller.abort(), 60_000);
    fetch(`${SERVER_URL}/health`, { signal: controller.signal })
      .then((res) => setStatus(res.ok ? 'ready' : 'offline'))
      .catch(() => setStatus('offline'))
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <main className="felt flex min-h-dvh flex-col items-center justify-center gap-6 px-4 pb-safe-b pt-safe-t text-center">
      <h1 className="font-display text-4xl font-bold text-gold-400">{t.appName}</h1>
      <p className="text-ink-300">{t.tagline}</p>
      <p role="status" className="rounded-full bg-black/30 px-4 py-2 text-sm">
        {t.home[status]}
      </p>
    </main>
  );
}
