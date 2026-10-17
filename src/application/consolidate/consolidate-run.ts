import type { Card } from '../../domain/cards/card.js';
import type { TaskResults } from '../ports/task-results.js';
import type { RunScope } from '../ports/run-events.js';
import {
  consolidateCards,
  type Consolidation,
  type ConsolidationParts,
} from './consolidate-cards.js';

// STUB (red commit): replaced in the next commit.
export interface ConsolidationStore {
  readonly store: Pick<TaskResults, 'readConsolidation' | 'writeConsolidation'>;
  readonly scope: RunScope;
}

export function consolidateRun(
  parts: ConsolidationParts,
  _where: ConsolidationStore,
  cards: readonly Card[],
): Promise<Consolidation> {
  return consolidateCards(parts, cards);
}
