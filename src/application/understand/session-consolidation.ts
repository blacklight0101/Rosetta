import type { Card } from '../../domain/cards/card.js';
import { consolidateRun } from '../consolidate/consolidate-run.js';
import {
  consolidationParts,
  type ConsolidationSource,
} from '../consolidate/consolidation-parts.js';
import type { CardOutputs, CardSource } from '../ports/card-outputs.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { TaskResults } from '../ports/task-results.js';
import { scopeOf } from '../runs/run-scope.js';
import { announceMerges } from './announce-cards.js';
import { changesOf, type Rerun } from './answer-rerun.js';

// RF-250, RF-006, P2-35: the summariser step of an understand session. It merges the duplicate
// cards of several areas (making again the merges an earlier session of a resumed run made, and
// asking only about the types it has not answered about), writes the card set once more when any
// merge stands and publishes where the claims of each new merge went.

export interface ConsolidationStep extends Omit<ConsolidationSource, 'runId' | 'signal'> {
  readonly deps: { readonly cards: CardOutputs; readonly taskResults: TaskResults };
  readonly execution: RunExecution;
  readonly source: CardSource;
  readonly rerun?: Rerun | undefined;
}

/** The cards after the step, or undefined when no merge stands and the cards are as they were. */
// RF-250
export async function consolidateStep(
  step: ConsolidationStep,
  state: { readonly cards: readonly Card[]; readonly areasWithoutCards: readonly string[] },
): Promise<readonly Card[] | undefined> {
  const { deps, execution, source } = step;
  const scope = scopeOf(execution.run);
  const parts = consolidationParts({
    ...step,
    runId: execution.run.runKey,
    signal: execution.signal,
  });
  const where = { store: deps.taskResults, scope };
  const merged = await consolidateRun(parts, where, state.cards);
  // P3-106: a card that kept a repeated claim once changed without a merge.
  if (merged.merges.length === 0 && merged.moves.length === 0) return undefined;
  const kept = new Set(merged.cards.map((card) => card.id));
  const mergedAway = state.cards.filter((card) => !kept.has(card.id));
  const changes = changesOf(step.rerun, merged.cards);
  const { areasWithoutCards } = state;
  await deps.cards.writeCards(scope, {
    cards: merged.cards,
    source,
    areasWithoutCards,
    mergedAway,
    ...changes,
  });
  await announceMerges(execution.events, merged);
  return merged.cards;
}
