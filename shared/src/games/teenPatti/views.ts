import type { Card } from '../../cards/cards';
import type {
  Comparison,
  Correction,
  PlayerId,
  RoundPlayer,
  RoundResult,
  RoundState,
  TablePlayer,
  TableState,
} from './types';
import type { Settings } from './settings';

export type PlayerStatus = 'blind' | 'seen' | 'packed';

export type PublicRoundPlayer = Omit<RoundPlayer, 'hand'> & { status: PlayerStatus };

export type PublicComparison = Omit<Comparison, 'enteredCards'> & {
  /** Who has entered their cards (not which cards). */
  enteredBy: PlayerId[];
};

export interface PublicRound {
  roundNumber: number;
  dealerSeat: number;
  rules: RoundState['rules'];
  players: PublicRoundPlayer[];
  pot: number;
  stake: number;
  turnId: PlayerId | null;
  phase: RoundState['phase'];
  pendingSideShow: RoundState['pendingSideShow'];
  comparison: PublicComparison | null;
  result: RoundResult | null;
  actionCount: number;
}

/** Everything every player at the table may see. Contains no hidden cards. */
export interface PublicTable {
  settings: Settings;
  players: TablePlayer[];
  dealerSeat: number | null;
  roundNumber: number;
  round: PublicRound | null;
  corrections: Correction[];
}

/** What only this player may see. */
export interface PrivateView {
  playerId: PlayerId;
  /** Own cards (digital), once the player has seen them or the round is over. */
  hand: Card[] | null;
  /** Other players' cards this player is allowed to see (e.g. after a side show). */
  visibleHands: Record<PlayerId, Card[]>;
  /** Physical "enter cards": cards already picked by the other players (greyed out). */
  takenCards: Card[];
  myEnteredCards: Card[] | null;
}

function statusOf(p: RoundPlayer): PlayerStatus {
  return p.packed ? 'packed' : p.seen ? 'seen' : 'blind';
}

export function publicRound(r: RoundState): PublicRound {
  const c = r.comparison;
  return {
    roundNumber: r.roundNumber,
    dealerSeat: r.dealerSeat,
    rules: { ...r.rules },
    players: r.players.map(({ hand: _hand, ...rest }) => ({
      ...rest,
      status: statusOf(rest as RoundPlayer),
    })),
    pot: r.pot,
    stake: r.stake,
    turnId: r.turnId,
    phase: r.phase,
    pendingSideShow: r.pendingSideShow ? { ...r.pendingSideShow } : null,
    comparison: c
      ? {
          reason: c.reason,
          requesterId: c.requesterId,
          playerIds: [...c.playerIds],
          method: c.method,
          proposal: c.proposal
            ? {
                ...c.proposal,
                winnerIds: [...c.proposal.winnerIds],
                confirmedBy: [...c.proposal.confirmedBy],
              }
            : null,
          enteredBy: Object.keys(c.enteredCards),
        }
      : null,
    result: r.result
      ? {
          ...r.result,
          winnerIds: [...r.result.winnerIds],
          payouts: { ...r.result.payouts },
          revealedHands: Object.fromEntries(
            Object.entries(r.result.revealedHands).map(([id, h]) => [id, [...h]]),
          ),
        }
      : null,
    actionCount: r.actions.length,
  };
}

export function publicView(t: TableState): PublicTable {
  return {
    settings: { ...t.settings },
    players: t.players.map((p) => ({ ...p })),
    dealerSeat: t.dealerSeat,
    roundNumber: t.roundNumber,
    round: t.round ? publicRound(t.round) : null,
    corrections: t.corrections.map((c) => ({ ...c })),
  };
}

export function privateView(t: TableState, playerId: PlayerId): PrivateView {
  const view: PrivateView = {
    playerId,
    hand: null,
    visibleHands: {},
    takenCards: [],
    myEnteredCards: null,
  };
  const r = t.round;
  if (!r) return view;
  const me = r.players.find((p) => p.id === playerId);
  if (me?.hand && (me.seen || r.phase === 'ENDED')) view.hand = [...me.hand];

  for (const reveal of r.sideShowReveals) {
    if (!reveal.viewerIds.includes(playerId)) continue;
    for (const [id, cards] of Object.entries(reveal.hands)) {
      if (id !== playerId) view.visibleHands[id] = [...cards];
    }
  }

  const c = r.comparison;
  if (c && c.method === 'enterCards' && c.playerIds.includes(playerId)) {
    for (const [id, cards] of Object.entries(c.enteredCards)) {
      if (id === playerId) view.myEnteredCards = [...cards];
      else view.takenCards.push(...cards);
    }
  }
  return view;
}

/**
 * Rebuild enough of a TableState from the public view for `legalActions` to run on a client.
 * Hidden data (hands, action log) is left empty; legality never depends on it.
 */
export function tableFromPublic(pub: PublicTable): TableState {
  const r = pub.round;
  return {
    settings: pub.settings,
    players: pub.players,
    dealerSeat: pub.dealerSeat,
    roundNumber: pub.roundNumber,
    round: r
      ? {
          roundNumber: r.roundNumber,
          dealerSeat: r.dealerSeat,
          rules: r.rules,
          players: r.players.map(({ status: _status, ...p }) => ({ ...p, hand: null })),
          pot: r.pot,
          stake: r.stake,
          turnId: r.turnId,
          phase: r.phase,
          pendingSideShow: r.pendingSideShow,
          comparison: r.comparison
            ? {
                reason: r.comparison.reason,
                requesterId: r.comparison.requesterId,
                playerIds: r.comparison.playerIds,
                method: r.comparison.method,
                proposal: r.comparison.proposal,
                enteredCards: Object.fromEntries(r.comparison.enteredBy.map((id) => [id, []])),
              }
            : null,
          sideShowReveals: [],
          comparisonResolved: false,
          actions: [],
          result: r.result,
          startBalances: {},
        }
      : null,
    roundInitial: null,
    corrections: pub.corrections,
  };
}
