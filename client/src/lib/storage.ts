// localStorage can be missing or throw (private mode, blocked storage). Never crash on it.

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
}

export function getPrefs(): Prefs {
  return { hints: true, ...readJson<Partial<Prefs>>(PREFS, {}) };
}

export function savePrefs(p: Prefs): void {
  writeJson(PREFS, p);
}
