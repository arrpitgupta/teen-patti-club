import { describeHand, type GameLogEvent } from '@tpc/shared';
import { t } from '../i18n';

export type NameOf = (id: string) => string;

/** Plain-English line for a log entry, or null for events not worth showing. */
export function describeEvent(e: GameLogEvent, nameOf: NameOf): string | null {
  const ev = t.events;
  switch (e.type) {
    case 'PLAYER_JOINED':
      return ev.joined(nameOf(e.playerId));
    case 'PLAYER_LEFT':
      return ev.left(nameOf(e.playerId));
    case 'ROUND_STARTED':
      return ev.roundStarted(e.roundNumber);
    case 'CARDS_DEALT':
      return ev.cardsDealt;
    case 'SAW_CARDS':
      return ev.saw(nameOf(e.playerId));
    case 'BET':
      return e.blind
        ? ev.betBlind(nameOf(e.playerId), e.amount)
        : ev.bet(nameOf(e.playerId), e.amount);
    case 'PACKED':
      return e.timedOut ? ev.timedOut(nameOf(e.playerId)) : ev.packed(nameOf(e.playerId));
    case 'SIDESHOW_REQUESTED':
      return ev.sideShowAsked(nameOf(e.playerId), nameOf(e.targetId));
    case 'SIDESHOW_DENIED':
      return ev.sideShowDenied(nameOf(e.playerId));
    case 'SIDESHOW_ACCEPTED':
      return ev.sideShowAccepted(nameOf(e.playerId));
    case 'SIDESHOW_RESULT':
      return e.tie
        ? ev.sideShowTie(nameOf(e.loserId))
        : ev.sideShowResult(nameOf(e.winnerId), nameOf(e.loserId));
    case 'SHOW_REQUESTED':
      return ev.showAsked(nameOf(e.playerId));
    case 'POT_LIMIT_REACHED':
      return ev.potLimit;
    case 'ROUND_ENDED':
      return e.result.winnerIds.length > 0
        ? ev.roundWon(e.result.winnerIds.map(nameOf).join(' & '), e.result.pot)
        : null;
    case 'ROUND_CANCELLED':
      return ev.cancelled;
    case 'CHIPS_ADJUSTED': {
      const side = (s: string) => (s === 'pot' ? t.host.pot : nameOf(s));
      return ev.adjusted(side(e.from), side(e.to), e.amount, e.reason);
    }
    case 'REBUY':
      return ev.rebuy(nameOf(e.playerId), e.amount);
    case 'UNDONE':
      return ev.undone;
    case 'UNDO_REQUESTED':
      return ev.undoAsked(nameOf(e.playerId));
    case 'UNDO_REJECTED':
      return ev.undoRejected;
    case 'HOST_CHANGED':
      return ev.hostChanged(nameOf(e.playerId));
    case 'HOST_TRANSFER_OFFERED':
      return ev.hostOffered(nameOf(e.playerId));
    case 'PLAYER_KICKED':
      return ev.kicked(nameOf(e.playerId));
    case 'OFFLINE_SEAT_ADDED':
      return ev.offlineAdded(nameOf(e.playerId));
    case 'PLAYER_DISCONNECTED':
      return ev.disconnected(nameOf(e.playerId));
    case 'PLAYER_RECONNECTED':
      return ev.reconnected(nameOf(e.playerId));
    case 'PAUSED':
      return ev.paused;
    case 'RESUMED':
      return ev.resumed;
    case 'GAME_STARTED':
      return ev.gameStarted;
    case 'GAME_ENDED':
      return ev.gameEnded;
    case 'TURN_OVERDUE':
      return ev.overdue(nameOf(e.playerId));
    case 'RESULT_PROPOSED':
      return ev.resultProposed(nameOf(e.playerId));
    case 'RESULT_CONFIRMED':
      return ev.resultConfirmed(nameOf(e.playerId));
    case 'RESULT_DISPUTED':
      return ev.resultDisputed(nameOf(e.playerId));
    case 'RESULT_CARDS_ENTERED':
      return ev.cardsEntered(nameOf(e.playerId));
    case 'YOU_WERE_KICKED':
      return ev.kickedYou;
    case 'PLAYER_AWAY':
      return e.away ? ev.away(nameOf(e.playerId)) : ev.back(nameOf(e.playerId));
    case 'HAND_SHOWN':
      return ev.handShown(nameOf(e.playerId), describeHand(e.cards));
    case 'HAND_ENTERED':
      return ev.handEntered(nameOf(e.playerId));
    case 'HANDS_CLASH':
      return ev.handsClash;
    case 'NUDGED':
      return ev.nudged(nameOf(e.by), nameOf(e.playerId));
    case 'REMATCH_CREATED':
      return ev.rematch(nameOf(e.playerId));
    case 'GAME_CREATED':
    case 'TURN':
    case 'COMPARISON_STARTED':
    case 'SETTINGS_UPDATED':
      return null;
  }
}

/** Events that deserve a toast for other players' actions (the log keeps everything). */
export const TOAST_EVENTS: ReadonlySet<GameLogEvent['type']> = new Set([
  'BET',
  'PACKED',
  'SIDESHOW_REQUESTED',
  'SIDESHOW_DENIED',
  'SIDESHOW_RESULT',
  'SHOW_REQUESTED',
  'POT_LIMIT_REACHED',
  'PLAYER_JOINED',
  'PLAYER_DISCONNECTED',
  'PLAYER_RECONNECTED',
  'HOST_CHANGED',
  'UNDONE',
  'UNDO_REJECTED',
  'CHIPS_ADJUSTED',
  'REBUY',
  'PAUSED',
  'RESUMED',
  'RESULT_DISPUTED',
  'YOU_WERE_KICKED',
  'NUDGED',
  'HANDS_CLASH',
  'PLAYER_AWAY',
  'HAND_SHOWN',
]);
