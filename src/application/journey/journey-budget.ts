import type { Amount, ApprovedAmount } from '../../domain/budget/approved-amount.js';
import { journeyRemaining } from '../../domain/journey/journey-record.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-435, ADR-027: a step of the project's journey runs under what is left of the one approved
// amount. A project with no journey (a run started by the evaluation tools) has no such line.

export interface JourneyBudgetDependencies {
  readonly journeys?: JourneyRecords | undefined;
  readonly runs: Pick<RunIndex, 'list'>;
}

/** The amount a new step may use: the journey's remainder; undefined when the project has no journey. */
// RF-435
export async function stepAmountOf(
  deps: JourneyBudgetDependencies,
  owner: { readonly userId: string; readonly projectId: string },
): Promise<ApprovedAmount | undefined> {
  const record = await deps.journeys?.find(owner.userId, owner.projectId);
  if (record === undefined) return undefined;
  const left: Amount = journeyRemaining(
    record,
    await deps.runs.list(owner.userId, owner.projectId),
  );
  return { tokens: left.tokens, costMicros: left.costMicros };
}
