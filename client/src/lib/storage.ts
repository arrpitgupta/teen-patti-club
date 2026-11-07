// localStorage can be missing or throw (private mode, blocked storage). Never crash on it.
import { SettingsSchema, type Settings } from '@tpc/shared';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage unavailable
  }
}

export interface SavedSeat {
  code: string;
  playerId: string;
  playerToken: string;
  joinedAt: number;
}

export interface Profile {
  name: string;
  avatar: string;
}

const SEATS = 'tpc.seats';
const PROFILE = 'tpc.profile';
const PREFS = 'tpc.prefs';

export function getSeats(): Record<string, SavedSeat> {
  return readJson<Record<string, SavedSeat>>(SEATS, {});
}

export function getSeat(code: string): SavedSeat | undefined {
  return getSeats()[code];
}

export function saveSeat(seat: SavedSeat): void {
  writeJson(SEATS, { ...getSeats(), [seat.code]: seat });
}

export function forgetSeat(code: string): void {
  const seats = getSeats();
  delete seats[code];
  writeJson(SEATS, seats);
}

/** Most recently joined seat (for "Rejoin your game" on the home screen). */
export function latestSeat(): SavedSeat | undefined {
  return Object.values(getSeats()).sort((a, b) => b.joinedAt - a.joinedAt)[0];
}

export function getProfile(): Profile | null {
  return readJson<Profile | null>(PROFILE, null);
}

export function saveProfile(p: Profile): void {
  writeJson(PROFILE, p);
}

export interface Prefs {
  hints: boolean;
  /** No chat toasts, bubbles or unread badge (messages still show in the drawer). */
  chatMuted: boolean;
  /** The "your turn" notification prompt was answered (or dismissed). */
  pushAsked: boolean;
  /** The player turned notifications off. */
  pushOff: boolean;
  /** The "How to play" walkthrough was shown (first launch). */
  seenWalkthrough: boolean;
  /** Sound effects muted. */
  soundOff: boolean;
}

export function getPrefs(): Prefs {
  return {
    hints: true,
    chatMuted: false,
    pushAsked: false,
    pushOff: false,
    seenWalkthrough: false,
    soundOff: false,
    ...readJson<Partial<Prefs>>(PREFS, {}),
  };
}

export interface RulePreset {
  name: string;
  settings: Settings;
  savedAt: number;
}

const PRESETS = 'tpc.presets';
export const PRESET_LIMIT = 12;

/** House-rule presets saved on this device. Presets that no longer validate are skipped. */
export function getPresets(): RulePreset[] {
  const raw = readJson<unknown>(PRESETS, []);
  if (!Array.isArray(raw)) return [];
  const out: RulePreset[] = [];
  for (const p of raw as Partial<RulePreset>[]) {
    const parsed = SettingsSchema.safeParse(p?.settings);
    if (typeof p?.name === 'string' && parsed.success) {
      out.push({ name: p.name, settings: parsed.data, savedAt: Number(p.savedAt) || 0 });
    }
  }
  return out;
}

/** Saves (or replaces, by name) a preset; newest first. */
export function savePreset(name: string, settings: Settings): RulePreset[] {
  const clean = name.trim().slice(0, 24);
  const rest = getPresets().filter((p) => p.name.toLowerCase() !== clean.toLowerCase());
  const next = [{ name: clean, settings, savedAt: Date.now() }, ...rest].slice(0, PRESET_LIMIT);
  writeJson(PRESETS, next);
  return next;
}

export function deletePreset(name: string): RulePreset[] {
  const next = getPresets().filter((p) => p.name !== name);
  writeJson(PRESETS, next);
  return next;
}

const CHAT_READ = 'tpc.chatRead';

/** Id of the last chat message this device has seen, per game code. */
export function getChatRead(code: string): number {
  return readJson<Record<string, number>>(CHAT_READ, {})[code] ?? 0;
}

export function saveChatRead(code: string, id: number): void {
  const all = readJson<Record<string, number>>(CHAT_READ, {});
  // Keep the map small: only the most recent games.
  const entries = Object.entries({ ...all, [code]: id }).slice(-20);
  writeJson(CHAT_READ, Object.fromEntries(entries));
}

export function savePrefs(p: Prefs): void {
  writeJson(PREFS, p);
}
