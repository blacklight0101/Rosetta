import type { Amount, ApprovedAmount } from '../../domain/budget/approved-amount.js';
import { journeyRemaining } from '../../domain/journey/journey-record.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';

// RF-435, ADR-027: a step of the project's journey runs under what is left of the one approved
// amount. A project with no journey (a run started by the evaluation tools) has no such line.

export interface JourneyBudgetDependencies {
  readonly journeys?: JourneyRecords | undefined;
  readonly runs: Pick<RunIndex, 'list'>;
  /** P8-03: the manifests of the journey's steps, to reserve what an unfinished step may still use. */
  readonly manifests?: Pick<RunManifestStore, 'read'> | undefined;
}

/** A step's line, and whether the journey's approved amount is used up. */
export interface StepLine {
  readonly amount: ApprovedAmount;
  readonly usedUp: boolean;
}

/** The line a new step may use; undefined when the project has no journey. */
// RF-435
export async function stepLineOf(
  deps: JourneyBudgetDependencies,
  owner: { readonly userId: string; readonly projectId: string },
): Promise<StepLine | undefined> {
  const record = await deps.journeys?.find(owner.userId, owner.projectId);
  if (record === undefined) return undefined;
  const left: Amount = journeyRemaining(
    record,
    await deps.runs.list(owner.userId, owner.projectId),
  );
  return { amount: { tokens: left.tokens, costMicros: left.costMicros }, usedUp: false };
}

/** The amount a new step may use: the journey's remainder; undefined when the project has no journey. */
// RF-435
export async function stepAmountOf(
  deps: JourneyBudgetDependencies,
  owner: { readonly userId: string; readonly projectId: string },
): Promise<ApprovedAmount | undefined> {
  return (await stepLineOf(deps, owner))?.amount;
}
