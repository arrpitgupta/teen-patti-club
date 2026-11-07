import type { PublicGameState } from '@tpc/shared';

export interface Spot {
  id: string;
  /** Centre of the seat, in % of the table box. */
  x: number;
  y: number;
}

/**
 * Players shown around the oval, clockwise starting after you. You sit at the bottom
 * (in your own hand area), so the others are spread evenly around the rest of the oval.
 */
export function seatSpots(
  pub: PublicGameState,
  meId: string,
  wide: boolean,
  compact = false,
): Spot[] {
  const inRound = new Set(pub.table.round?.players.map((p) => p.id) ?? []);
  const seated = pub.players
    .filter((p) => p.present || inRound.has(p.id))
    .sort((a, b) => a.seat - b.seat);
  const myIndex = seated.findIndex((p) => p.id === meId);
  const others =
    myIndex >= 0 ? [...seated.slice(myIndex + 1), ...seated.slice(0, myIndex)] : seated;
  const n = others.length;
  const rx = wide ? 41 : 37;
  // Spots mark the avatar centre; names hang below it, so the lower half is flatter.
  const ryTop = wide ? 36 : compact ? 40 : 38;
  const ryBottom = wide ? 22 : compact ? 32 : 24;
  return others.map((p, i) => {
    // You are at 90° (bottom). Angles grow clockwise on screen: left, top, right.
    const step = 360 / (myIndex >= 0 ? n + 1 : n);
    const deg = myIndex >= 0 ? 90 + step * (i + 1) : 90 + step * i + step / 2;
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    return { id: p.id, x: 50 + rx * Math.cos(rad), y: 50 + (sin < 0 ? ryTop : ryBottom) * sin };
  });
}

/** Point `t` of the way from a seat towards the table centre. */
export function towardCentre(s: Spot, t: number): { x: number; y: number } {
  return { x: s.x + (50 - s.x) * t, y: s.y + (50 - s.y) * t };
}
