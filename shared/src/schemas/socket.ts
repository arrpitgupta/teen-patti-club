import { z } from 'zod';
import { isCard, type Card } from '../cards/cards';
import { ChatTextSchema, ReactionSchema } from '../chat';
import { SettingsSchema } from '../games/teenPatti/settings';

/** 6 characters, no look-alikes (no I, O, 0, 1). */
export const GameCodeSchema = z
  .string()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Game codes are 6 letters/numbers.');
export const PlayerTokenSchema = z.string().min(16).max(128);
export const PlayerIdSchema = z.string().min(1).max(64);
export const DisplayNameSchema = z.string().trim().min(1).max(20);
export const AvatarSchema = z.string().min(1).max(32);
export const ChipAmountSchema = z.number().int().positive().max(1_000_000_000);
export const CardSchema = z.custom<Card>((v) => isCard(v), 'Invalid card');

/** A browser PushSubscription (toJSON()). Stored server-side only. */
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).startsWith('https://'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Banker mode: the host may act for an offline seat. */
const actAs = { actAs: PlayerIdSchema.optional() };
const empty = z.object({}).strict();
const seatAction = z.object(actAs).strict();

export const ClientEventSchemas = {
  'game:create': z
    .object({ name: DisplayNameSchema, avatar: AvatarSchema, settings: SettingsSchema })
    .strict(),
  'game:join': z
    .object({ code: GameCodeSchema, name: DisplayNameSchema, avatar: AvatarSchema })
    .strict(),
  'game:reconnect': z.object({ code: GameCodeSchema, playerToken: PlayerTokenSchema }).strict(),
  'game:updateSettings': z.object({ settings: SettingsSchema }).strict(),
  'game:start': empty,
  'game:leave': empty,
  'game:end': empty,
  'round:start': empty,
  'round:cardsDealt': empty,
  /** After a round: show your cards (physical without an entered hand: the cards shown). */
  'round:showCards': z
    .object({ cards: z.tuple([CardSchema, CardSchema, CardSchema]).optional(), ...actAs })
    .strict(),
  /** Sit out upcoming rounds (no boot) or come back. */
  'game:away': z.object({ away: z.boolean(), ...actAs }).strict(),
  'action:see': seatAction,
  'action:chaal': z.object({ amount: ChipAmountSchema, ...actAs }).strict(),
  'action:pack': seatAction,
  'action:sideshowRequest': seatAction,
  'action:sideshowRespond': z.object({ accept: z.boolean(), ...actAs }).strict(),
  'action:show': seatAction,
  'result:tapWinner': z
    .object({ winnerIds: z.array(PlayerIdSchema).min(1).max(10), ...actAs })
    .strict(),
  /** Physical: "Enter my hand" (private). */
  'action:enterHand': z
    .object({ cards: z.tuple([CardSchema, CardSchema, CardSchema]), ...actAs })
    .strict(),
  'result:confirm': seatAction,
  'result:dispute': seatAction,
  'result:enterCards': z
    .object({ cards: z.tuple([CardSchema, CardSchema, CardSchema]), ...actAs })
    .strict(),
  'undo:request': empty,
  'undo:approve': empty,
  'undo:reject': empty,
  'host:adjustChips': z
    .object({
      from: z.union([PlayerIdSchema, z.literal('pot')]),
      to: z.union([PlayerIdSchema, z.literal('pot')]),
      amount: ChipAmountSchema,
      reason: z.string().trim().min(1).max(140),
    })
    .strict(),
  'host:rebuy': z.object({ playerId: PlayerIdSchema }).strict(),
  'host:kick': z.object({ playerId: PlayerIdSchema }).strict(),
  'host:transfer': z.object({ playerId: PlayerIdSchema }).strict(),
  'host:addOfflineSeat': z.object({ name: DisplayNameSchema, avatar: AvatarSchema }).strict(),
  'host:pause': z.object({ paused: z.boolean() }).strict(),
  /** The player offered the host role (host away > 2 min) accepts it. */
  'host:claim': empty,
  /** quick = a preset line (floats over the seat like a reaction). */
  'chat:send': z.object({ text: ChatTextSchema, quick: z.boolean().optional() }).strict(),
  'chat:react': z.object({ emoji: ReactionSchema }).strict(),
  /** Buzz the player to act (after NUDGE_AFTER_MS on their turn, once per NUDGE_COOLDOWN_MS). */
  'game:nudge': empty,
  /** "Your turn" notifications for this game on this device. */
  'push:subscribe': z.object({ subscription: PushSubscriptionSchema }).strict(),
  'push:unsubscribe': z.object({ endpoint: z.string().max(2000) }).strict(),
  /** After the game ended: create the rematch (first tap) or join it (everyone else). */
  'game:rematch': empty,
} as const;

export type ClientEventName = keyof typeof ClientEventSchemas;
export type ClientEventPayload<E extends ClientEventName> = z.infer<(typeof ClientEventSchemas)[E]>;

export const SERVER_EVENTS = [
  'state:public',
  'state:private',
  'event',
  'error',
  'chat',
  'chat:history',
] as const;
export type ServerEventName = (typeof SERVER_EVENTS)[number];

export function isClientEventName(name: string): name is ClientEventName {
  return Object.prototype.hasOwnProperty.call(ClientEventSchemas, name);
}

export function parseClientEvent(
  name: string,
  payload: unknown,
): { ok: true; data: unknown } | { ok: false; message: string } {
  if (!isClientEventName(name)) return { ok: false, message: `Unknown event: ${name}` };
  const result = ClientEventSchemas[name].safeParse(payload ?? {});
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? 'Invalid request.' };
  }
  return { ok: true, data: result.data };
}
