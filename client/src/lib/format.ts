import { cardLabel, type Card } from '@tpc/shared';

const nf = new Intl.NumberFormat('en-IN');

export function chips(n: number): string {
  return n < 0 ? `−${nf.format(-n)}` : nf.format(n);
}

/** Signed net: +480, −320, 0. Uses a real minus sign. */
export function net(n: number): string {
  if (n > 0) return `+${nf.format(n)}`;
  if (n < 0) return `−${nf.format(-n)}`;
  return '0';
}

export function rupees(chipCount: number, rate: number | null): string | null {
  if (rate === null) return null;
  const v = Math.abs(chipCount) * rate;
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v)}`;
}

export function cards(cs: readonly Card[]): string {
  return cs.map(cardLabel).join(' ');
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '?';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (a + b).toUpperCase();
}

const AVATAR_COLORS = [
  '#3B6EA8',
  '#9C4F96',
  '#C0703A',
  '#2E8B7A',
  '#A23B4F',
  '#6A7F2E',
  '#4F6BB3',
  '#B0567A',
  '#8A6A2E',
  '#5E8C3A',
];

export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
