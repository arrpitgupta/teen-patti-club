// The interactive tutorial: one scripted round against 3 bots. The coach pauses at each step;
// only the move it asks for is accepted. Every number the coach says comes from the engine.
import {
  ALL_CARDS,
  legalActions,
  parseCards,
  type Card,
  type ClientEventName,
  type GameLogEvent,
  type TableAction,
  type TableState,
} from '@tpc/shared';
import { create } from 'zustand';
import { t } from '../i18n';
import { BOTS, type BotProfile } from './bots';
import { ME, type LocalHooks } from './localGame';

export const TUTORIAL_BOTS: BotProfile[] = [BOTS[0]!, BOTS[1]!, BOTS[2]!]; // Asha, Rohit, Dev
export const [ASHA, ROHIT, DEV] = TUTORIAL_BOTS.map((b) => b.id) as [string, string, string];

export type StepId =
  | 'welcome'
  | 'blindChaal'
  | 'ashaTurn'
  | 'ashaSaw'
  | 'rohitTurn'
  | 'rohitPacked'
  | 'devTurn'
  | 'see'
  | 'handName'
  | 'double'
  | 'sideShow'
  | 'sideShowResult'
  | 'devSees'
  | 'show'
  | 'won';

interface Step {
  /** The coach waits for "Next" (bots wait too). */
  next?: StepId;
  /** The only player action allowed in this step. */
  allow?: (name: ClientEventName, payload: Record<string, unknown>, t: TableState) => boolean;
  /** Bots act in this step (scripted below). */
  bots?: boolean;
}

const myLegal = (table: TableState) => legalActions(table, ME);

export const STEPS: Record<StepId, Step> = {
  welcome: { next: 'blindChaal' },
  blindChaal: {
    allow: (n, p, table) => n === 'action:chaal' && p.amount === myLegal(table).bet?.min,
  },
  ashaTurn: { bots: true },
  ashaSaw: { next: 'rohitTurn' },
  rohitTurn: { bots: true },
  rohitPacked: { next: 'devTurn' },
  devTurn: { bots: true },
  see: { allow: (n) => n === 'action:see' },
  handName: { next: 'double' },
  double: {
    allow: (n, p, table) => n === 'action:chaal' && p.amount === myLegal(table).bet?.max,
  },
  sideShow: { bots: true, allow: (n, p) => n === 'action:sideshowRespond' && p.accept === true },
  sideShowResult: { next: 'devSees' },
  devSees: { bots: true },
  show: { allow: (n) => n === 'action:show' },
  won: {},
};

interface TutorialStore {
  step: StepId;
  go(step: StepId): void;
}

export const useTutorial = create<TutorialStore>((set) => ({
  step: 'welcome',
  go: (step) => set({ step }),
}));

/** You: Pair of Kings. Asha: Pair of Fives. Rohit and Dev: high cards. */
export function tutorialDeck(): Card[] {
  // Deal order: left of the dealer (Dev): you, Asha, Rohit, Dev.
  const hands = [
    parseCards('Ks Kh 4d'),
    parseCards('5s 5d 9c'),
    parseCards('2c 7d Jh'),
    parseCards('Qd 8c 3s'),
  ];
  const deck: Card[] = [];
  for (let i = 0; i < 3; i++) for (const h of hands) deck.push(h[i]!);
  const used = new Set(deck);
  return [...deck, ...ALL_CARDS.filter((c) => !used.has(c))];
}

function scriptedBot(table: TableState, bot: BotProfile): TableAction | null {
  const step = useTutorial.getState().step;
  const me = table.round!.players.find((p) => p.id === bot.id)!;
  const L = legalActions(table, bot.id);
  const chaalMin = (): TableAction => ({ type: 'CHAAL', playerId: bot.id, amount: L.bet!.min });
  if (step === 'ashaTurn' && bot.id === ASHA) {
    return me.seen ? chaalMin() : { type: 'SEE', playerId: bot.id };
  }
  if (step === 'rohitTurn' && bot.id === ROHIT) return { type: 'PACK', playerId: bot.id };
  if (step === 'devTurn' && bot.id === DEV) return chaalMin();
  if (step === 'sideShow' && bot.id === ASHA) return { type: 'SIDESHOW_REQUEST', playerId: bot.id };
  if (step === 'devSees' && bot.id === DEV) {
    return me.seen ? chaalMin() : { type: 'SEE', playerId: bot.id };
  }
  return null;
}

/** Advance the script from what just happened at the table. */
function onEvents(events: GameLogEvent[]): void {
  for (const e of events) {
    const { step, go } = useTutorial.getState();
    if (step === 'blindChaal' && e.type === 'BET' && e.playerId === ME) go('ashaTurn');
    else if (step === 'ashaTurn' && e.type === 'BET' && e.playerId === ASHA) go('ashaSaw');
    else if (step === 'rohitTurn' && e.type === 'PACKED' && e.playerId === ROHIT) go('rohitPacked');
    else if (step === 'devTurn' && e.type === 'BET' && e.playerId === DEV) go('see');
    else if (step === 'see' && e.type === 'SAW_CARDS' && e.playerId === ME) go('handName');
    else if (step === 'double' && e.type === 'BET' && e.playerId === ME) go('sideShow');
    else if (step === 'sideShow' && e.type === 'SIDESHOW_RESULT') go('sideShowResult');
    else if (step === 'devSees' && e.type === 'BET' && e.playerId === DEV) go('show');
    else if (step === 'show' && e.type === 'ROUND_ENDED') go('won');
  }
}

export function tutorialHooks(): LocalHooks {
  useTutorial.getState().go('welcome');
  return {
    deck: () => tutorialDeck(),
    allow: (name, payload, table) => {
      if (name.startsWith('chat:')) return null;
      const step = STEPS[useTutorial.getState().step];
      return step.allow?.(name, payload, table) ? null : t.tutorial.followCoach;
    },
    botAction: (table, bot) => scriptedBot(table, bot),
    botsPaused: () => !STEPS[useTutorial.getState().step].bots,
    onChange: (_table, events) => onEvents(events),
  };
}
