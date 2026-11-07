import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { Sheet } from './ui/Sheet';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export function canScanQr(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Pulls a game code out of a scanned invite link (…/join/ABC234) or a bare code. */
export function codeFromScan(text: string): string | null {
  const m = /([A-HJ-NP-Z2-9]{6})\/?$/i.exec(text.trim());
  return m ? m[1]!.toUpperCase() : null;
}

/** In-app QR scanner (Chrome on Android). Elsewhere, the phone's camera app opens the link. */
export function QrScanner({
  open,
  onClose,
  onCode,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor) {
      setError(t.join.scanUnsupported);
      return;
    }
    const detector = new Ctor({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        while (!stopped && video.current) {
          const found = await detector.detect(video.current).catch(() => []);
          const code = found.map((f) => codeFromScan(f.rawValue)).find(Boolean);
          if (code) {
            onCode(code);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      })
      .catch(() => setError(t.join.scanUnsupported));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, onCode]);

  return (
    <Sheet open={open} onClose={onClose} title={t.join.scan}>
      {error ? (
        <p className="text-[15px] text-ink-300">{error}</p>
      ) : (
        <>
          <p className="text-sm text-ink-300">{t.join.scanHint}</p>
          <video
            ref={video}
            playsInline
            muted
            className="aspect-square w-full rounded-2xl bg-black object-cover"
          />
        </>
      )}
    </Sheet>
  );
}
