// Small synthesized sound effects (no audio files). Muted with prefs.soundOff.
// Browsers only allow audio after a user gesture, so the context is created lazily.
import { getPrefs } from './storage';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (getPrefs().soundOff) return null;
  try {
    ctx ??= new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call once from a user gesture so later sounds are allowed (iOS). */
export function unlockAudio(): void {
  const a = audio();
  if (!a) return;
  const b = a.createBuffer(1, 1, 22050);
  const s = a.createBufferSource();
  s.buffer = b;
  s.connect(a.destination);
  s.start(0);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, from: number, to: number, gain: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sound = {
  /** Chips clicking into the pot. */
  chip: () => {
    tone(2600, 0, 0.05, 'triangle', 0.08);
    tone(3300, 0.045, 0.05, 'triangle', 0.06);
  },
  /** A card sliding across the felt. */
  deal: () => noise(0, 0.12, 2400, 900, 0.18),
  /** Your turn: two soft notes. */
  turn: () => {
    tone(660, 0, 0.16, 'sine', 0.12);
    tone(880, 0.12, 0.22, 'sine', 0.12);
  },
  /** You won the pot. */
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.28, 'triangle', 0.12));
  },
};
