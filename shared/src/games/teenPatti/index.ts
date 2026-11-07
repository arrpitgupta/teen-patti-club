import type { GameDefinition } from '../../engine/types';
import { legalActions, type LegalActions } from './legal';
import type { Settings } from './settings';
import { applyAction, createTable, isRoundInProgress } from './table';
import type { TableAction, TableState, TeenPattiEvent } from './types';

export const teenPatti: GameDefinition<
  TableState,
  TableAction,
  TeenPattiEvent,
  LegalActions,
  Settings
> = {
  id: 'teen-patti',
  displayName: 'Teen Patti',
  setup: createTable,
  legalActions,
  applyAction,
  isRoundOver: (state) => !isRoundInProgress(state),
};

export * from './legal';
export * from './round';
export * from './settings';
export * from './table';
export * from './types';
export * from './views';
