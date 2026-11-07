/**
 * @tpc/shared — pure, I/O-free game engine shared by server and client.
 * Rules decisions are documented in docs/RULES.md.
 */
export const ENGINE_VERSION = '0.1.0';

export * from './cards/cards';
export * from './engine/types';
export { deepClone } from './engine/clone';
export * from './evaluator/evaluator';
export * from './games/teenPatti';
export * from './settlement/settlement';
export * from './schemas/socket';
export * from './protocol';
