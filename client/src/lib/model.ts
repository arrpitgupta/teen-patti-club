import {
  describeHand,
  legalActions,
  tableFromPublic,
  type BetRange,
  type LegalActions,
  type PrivateGameState,
  type PublicGameState,
  type PublicPlayer,
  type PublicRound,
  type PublicRoundPlayer,
} from '@tpc/shared';
import { t } from '../i18n';

/** Everything a table screen needs, derived from server state + the shared engine. */
export interface TableModel {
  pub: PublicGameState;
  priv: PrivateGameState | null;
  meId: string;
  me: PublicPlayer | undefined;
  isHost: boolean;
  round: PublicRound | null;
  mode: 'digital' | 'physical';
  openTab: boolean;
  nameOf(id: string): string;
  playerOf(id: string): PublicPlayer | undefined;
  rpOf(id: string): PublicRoundPlayer | undefined;
  /** Net chips for settlement (balance − buy-ins). */
  netOf(p: PublicPlayer): number;
  /** Who the game is waiting on: turn player, or the side-show target. */
  waitingOn: string | null;
  /** Seat whose controls this phone shows: you, or (host) an offline/disconnected seat. */
  actorId: string;
  actingForOther: boolean;
  /** Engine legal moves for `actorId`. */
  legal: LegalActions;
  /** Bet range the actor would have after seeing their cards (for the blind hint). */
  seenRange: BetRange | null;
  handName: string | null;
}

export function canHostActFor(pub: PublicGameState, id: string): boolean {
  const p = pub.players.find((x) => x.id === id);
  return !!p && p.present && (p.isOffline || !p.connected);
}

export function buildModel(
  pub: PublicGameState,
  priv: PrivateGameState | null,
  meId: string,
): TableModel {
  const round = pub.table.round;
  const isHost = pub.hostPlayerId === meId;
  const me = pub.players.find((p) => p.id === meId);
  const table = tableFromPublic(pub.table);

  let waitingOn: string | null = null;
  if (pub.status === 'active' && round) {
    if (round.phase === 'BETTING') waitingOn = round.turnId;
    else if (round.phase === 'AWAITING_SIDESHOW_RESPONSE')
      waitingOn = round.pendingSideShow?.targetId ?? null;
  }

  let actorId = meId;
  if (waitingOn && waitingOn !== meId && isHost && canHostActFor(pub, waitingOn))
    actorId = waitingOn;

  const legal = legalActions(table, actorId);

  let seenRange: BetRange | null = null;
  const actorRound = round?.players.find((p) => p.id === actorId);
  if (table.round && actorRound && !actorRound.seen) {
    const seen = structuredClone(table);
    const rp = seen.round!.players.find((p) => p.id === actorId)!;
    rp.seen = true;
    seenRange = legalActions(seen, actorId).bet;
  }

  const handName =
    priv?.hand && round ? describeHand(priv.hand, { a23Rank: round.rules.a23Rank }) : null;

  return {
    pub,
    priv,
    meId,
    me,
    isHost,
    round,
    mode: pub.table.settings.mode,
    openTab: pub.table.settings.chipMode === 'openTab',
    nameOf: (id) =>
      id === meId ? t.common.you : (pub.players.find((p) => p.id === id)?.name ?? '?'),
    playerOf: (id) => pub.players.find((p) => p.id === id),
    rpOf: (id) => round?.players.find((p) => p.id === id),
    netOf: (p) => p.balance - p.totalBuyIn,
    waitingOn,
    actorId,
    actingForOther: actorId !== meId,
    legal,
    seenRange,
    handName,
  };
}

/** "Neha", "Neha and Rohit", "Neha, Rohit and Aman". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
