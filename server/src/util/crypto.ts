import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** No look-alikes (I, O, 0, 1). Must match GameCodeSchema in @tpc/shared. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newGameCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function newPlayerId(): string {
  return randomBytes(9).toString('base64url');
}

export function newPlayerToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cryptographically secure shuffle source for the engine. */
export function secureRandomInt(maxExclusive: number): number {
  return randomInt(maxExclusive);
}
