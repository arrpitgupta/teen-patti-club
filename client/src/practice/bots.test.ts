import {
  applyAction,
  createDeck,
  createTable,
  defaultSettings,
  isRoundInProgress,
  parseCards,
  shuffle,
  type TableState,
} from '@tpc/shared';
import { describe, expect, it } from 'vitest';
import { BOTS, botMove, handStrength } from './bots';

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('practice bots', () => {
  it('rank hands sensibly', () => {
    const s = (h: string) => handStrength(parseCards(h), 'second');
    expect(s('As Ad Ac')).toBeGreaterThan(s('7h 8h 9h'));
    expect(s('7h 8h 9h')).toBeGreaterThan(s('2s 2d 9c'));
    expect(s('2s 2d 9c')).toBeGreaterThan(s('As Kd 9c'));
    expect(s('As Kd 9c')).toBeGreaterThan(s('7s 4d 2c'));
  });

  it('200 bot-only games: every move is legal and every round ends', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seeded(seed);
      const bots = BOTS.slice(0, 2 + (seed % 4));
      let t: TableState = createTable({
        ...defaultSettings('digital'),
        potLimit: seed % 3 === 0 ? 500 : null,
      });
      for (const b of bots) {
        const r = applyAction(t, { type: 'ADD_PLAYER', playerId: b.id });
        if (r.ok) t = r.state;
      }
      for (let round = 0; round < 4; round++) {
        const start = applyAction(t, {
          type: 'START_ROUND',
          deck: shuffle(createDeck(), (n) => Math.floor(rng() * n)),
        });
        if (!start.ok) throw new Error(start.error.message);
        t = start.state;
        let steps = 0;
        while (isRoundInProgress(t)) {
          // Rounds should wrap up in a reasonable number of moves.
          if (++steps > 120) throw new Error(`seed ${seed}: round dragged on too long`);
          const r = t.round!;
          const who =
            r.phase === 'AWAITING_SIDESHOW_RESPONSE' ? r.pendingSideShow!.targetId : r.turnId!;
          const bot = bots.find((b) => b.id === who)!;
          const move = botMove(t, bot, rng);
          expect(move).not.toBeNull();
          const res = applyAction(t, move!);
          if (!res.ok) throw new Error(`seed ${seed}: ${move!.type} illegal: ${res.error.message}`);
          t = res.state;
        }
      }
    }
  });
});
