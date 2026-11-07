import { z } from 'zod';
import type { PlayerId } from './games/teenPatti/types';

/** Quick reactions, one tap to send. They float over the sender's seat. */
export const REACTIONS = ['😂', '🔥', '😱', '👏', '🙏', '😏'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const CHAT_MAX_CHARS = 300;
/** Messages kept with the game (older ones are dropped). */
export const CHAT_HISTORY_LIMIT = 200;

/**
 * text: typed message (drawer + small toast).
 * quick: preset line (floats over the seat). Presets live in the client's i18n file, so the
 *   server only sees their text.
 * reaction: one of REACTIONS (floats over the seat).
 */
export type ChatKind = 'text' | 'quick' | 'reaction';

export interface ChatMessage {
  /** Increases by one per game; clients merge history by id. */
  id: number;
  at: number;
  playerId: PlayerId;
  kind: ChatKind;
  text: string;
}

/** Sent to a socket when it (re)joins a game, so missed messages appear. */
export interface ChatHistory {
  code: string;
  messages: ChatMessage[];
}

/** A newly sent message, broadcast to the table. */
export interface ChatDelivery {
  code: string;
  message: ChatMessage;
}

export const ChatTextSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1, 'Type a message first.')
      .max(CHAT_MAX_CHARS, `Messages can be up to ${CHAT_MAX_CHARS} characters.`),
  );

export const ReactionSchema = z.enum(REACTIONS);
