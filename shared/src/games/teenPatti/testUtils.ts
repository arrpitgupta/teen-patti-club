// Test helpers (only imported by *.test.ts files).
import { expect } from 'vitest';
import { ALL_CARDS, createDeck, parseCards, type Card } from '../../cards/cards';
import { defaultSettings, type Settings } from './settings';
import { applyAction, createTable, planNextRound } from './table';
import type {
  RoundPlayer,
  RoundState,
  TableAction,
  TableState,
  TeenPattiEvent,
  TeenPattiResult,
} from './types';

export function makeTable(ids: string[], overrides: Partial<Settings> = {}): TableState {
  let t = createTable({ ...defaultSettings(overrides.mode ?? 'digital'), ...overrides });
  for (const id of ids) t = act(t, { type: 'ADD_PLAYER', playerId: id });
  return t;
}

export function ok(result: TeenPattiResult<TableState>): {
  state: TableState;
  events: TeenPattiEvent[];
} {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

export function act(t: TableState, ...actions: TableAction[]): TableState {
  for (const a of actions) t = ok(applyAction(t, a)).state;
  return t;
}

export function expectError(result: TeenPattiResult<TableState>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

/** Build a deck so that dealing gives each player the listed hand. */
export function riggedDeck(t: TableState, hands: Record<string, string>): Card[] {
  const plan = planNextRound(t);
  if (!plan) throw new Error('Cannot start a round');
  const parsed: Record<string, Card[]> = {};
  for (const [id, text] of Object.entries(hands)) parsed[id] = parseCards(text);
  const deck: Card[] = [];
  for (let i = 0; i < 3; i++) {
    for (const id of plan.order) {
      const hand = parsed[id];
      if (!hand) throw new Error(`No hand for ${id}`);
      deck.push(hand[i]!);
    }
  }
  const used = new Set(deck);
  if (used.size !== deck.length) throw new Error('Duplicate card in rigged hands');
  return [...deck, ...ALL_CARDS.filter((c) => !used.has(c))];
}

export function startWith(t: TableState, hands: Record<string, string>): TableState {
  return act(t, { type: 'START_ROUND', deck: riggedDeck(t, hands) });
}

/** Start a round; in digital mode use an unshuffled deck. */
export function startAny(t: TableState): TableState {
  return act(t, { type: 'START_ROUND', deck: createDeck() });
}

export function round(t: TableState): RoundState {
  if (!t.round) throw new Error('No round');
  return t.round;
}

export function rp(t: TableState, id: string): RoundPlayer {
  const p = round(t).players.find((x) => x.id === id);
  if (!p) throw new Error(`No round player ${id}`);
  return p;
}

export function balances(t: TableState): Record<string, number> {
  return Object.fromEntries(t.players.map((p) => [p.id, p.balance]));
}

/** Everyone whose turn it is packs until the round ends. */
export function packUntilOver(t: TableState): TableState {
  while (t.round && t.round.phase === 'BETTING' && t.round.turnId) {
    t = act(t, { type: 'PACK', playerId: t.round.turnId });
  }
  return t;
}
