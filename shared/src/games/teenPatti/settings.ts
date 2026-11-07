import { z } from 'zod';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
/** Shown as a lobby hint: Teen Patti plays best with 3–7 players. */
export const IDEAL_PLAYERS = { min: 3, max: 7 } as const;

const MAX_CHIPS = 1_000_000_000;
const chips = z.number().int().positive().max(MAX_CHIPS);

export const SettingsSchema = z
  .object({
    /** Digital: the app deals cards. Physical: real cards; the app handles betting only. */
    mode: z.enum(['digital', 'physical']),
    /**
     * openTab: everyone starts at 0, balances may go negative without limit.
     * buyIn: everyone starts with `startingChips`; balances never go below 0.
     */
    chipMode: z.enum(['openTab', 'buyIn']),
    startingChips: z.number().int().min(0).max(MAX_CHIPS),
    boot: chips,
    /** Cap on the stake (blind-equivalent). Seen players may pay up to 2x this. null = no limit. */
    maxChaal: chips.nullable(),
    /** When the pot reaches this, everyone still in shows. null = no limit. */
    potLimit: chips.nullable(),
    /** Blind bets allowed per round before a player must see. null = no limit. */
    maxBlinds: z.number().int().positive().max(100).nullable(),
    a23Rank: z.enum(['second', 'lowest']),
    blindCanShow: z.boolean(),
    turnTimerSec: z.union([z.literal(30), z.literal(60)]).nullable(),
    physicalResolution: z.enum(['tapWinner', 'enterCards', 'hybrid']),
    /** Display only: rupees per chip. null = off. */
    chipRate: z.number().positive().max(1_000_000).nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (s.chipMode === 'openTab' && s.startingChips !== 0) {
      issue('startingChips', 'Open tab games start at 0 chips.');
    }
    if (s.chipMode === 'buyIn' && s.startingChips < s.boot) {
      issue('startingChips', 'The buy-in must be at least the boot amount.');
    }
    if (s.maxChaal !== null && s.maxChaal < s.boot) {
      issue('maxChaal', 'Max chaal cannot be less than the boot.');
    }
    if (s.potLimit !== null && s.potLimit < s.boot) {
      issue('potLimit', 'Pot limit cannot be less than the boot.');
    }
  });

export type Settings = z.infer<typeof SettingsSchema>;
export type GameMode = Settings['mode'];

export function defaultSettings(mode: GameMode = 'digital'): Settings {
  return {
    mode,
    chipMode: 'openTab',
    startingChips: 0,
    boot: 10,
    maxChaal: 1280,
    potLimit: 10240,
    maxBlinds: 4,
    a23Rank: 'second',
    blindCanShow: true,
    turnTimerSec: mode === 'digital' ? 30 : null,
    physicalResolution: 'hybrid',
    chipRate: null,
  };
}
