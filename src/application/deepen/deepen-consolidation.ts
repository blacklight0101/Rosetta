import { consolidateRun, type RunConsolidation } from '../consolidate/consolidate-run.js';
import { consolidationParts } from '../consolidate/consolidation-parts.js';
import type { ConsolidationRecord, TaskResults } from '../ports/task-results.js';
import type { RunScope } from '../ports/run-events.js';
import { scopeOf } from '../runs/run-scope.js';
import type { Card } from '../../domain/cards/card.js';
import type { DeepenParts } from './deepen-parts.js';

// RF-250, RF-006, Q-52, P3-67: the summariser step of a Deepen run. The rounds write cards beside
// the cards the parent holds, often for an area the parent already has cards for, so at the end the
// summariser is asked about every mergeable type that two reader tasks wrote (`typesToMerge`),
// starting from the merges and answers the parent run recorded: the parent's merges are made again
// and a type the parent answered about is asked again only when the Deepen added a card of it. The
// task results stay as the readers wrote them, so a resume of the Deepen makes the merges again.

function isEmpty(record: ConsolidationRecord): boolean {
  return record.types.length === 0 && record.merges.length === 0;
}

/** The Deepen's own record, or the parent's while the Deepen has none; writes go to the Deepen's. */
async function recordsOf(
  parts: DeepenParts,
): Promise<Pick<TaskResults, 'readConsolidation' | 'writeConsolidation'>> {
  const { run } = parts.execution;
  const { taskResults, runs } = parts.deps;
  const parent = await runs.find(run.userId, parts.request.parentRunId);
  return {
    writeConsolidation: (scope: RunScope, record: ConsolidationRecord) =>
      taskResults.writeConsolidation(scope, record),
    async readConsolidation(scope: RunScope): Promise<ConsolidationRecord> {
      const own = await taskResults.readConsolidation(scope);
      if (!isEmpty(own) || parent === undefined) return own;
      return taskResults.readConsolidation(scopeOf(parent));
    },
  };
}

/** The cards with their duplicates merged, or undefined when no merge stands. */
// RF-250
export async function mergeDuplicates(
  parts: DeepenParts,
  cards: readonly Card[],
): Promise<RunConsolidation | undefined> {
  const { execution, mergePrompt } = parts;
  const source = {
    ...parts,
    ...{ mergePrompt, runId: execution.run.runKey, signal: execution.signal },
  };
  const where = { store: await recordsOf(parts), scope: scopeOf(execution.run) };
  const merged = await consolidateRun(consolidationParts(source), where, cards);
  return merged.merges.length === 0 && merged.moves.length === 0 ? undefined : merged;
}
