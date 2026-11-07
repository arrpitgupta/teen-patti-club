/**
 * @tpc/shared — pure, I/O-free game engine shared by server and client.
 *
 * Planned modules (Phase 2):
 *   cards/       Card, Suit, Rank, deck + Fisher–Yates shuffle (RNG injected)
 *   evaluator/   hand scoring, compareHands, describeHand
 *   engine/      GameDefinition interface, applyAction reducer, comparison resolver
 *   games/teenPatti/  Teen Patti GameDefinition
 *   settlement/  nets + minimal payment list
 *   schemas/     zod schemas for every socket payload
 */
export const ENGINE_VERSION = '0.0.1';
