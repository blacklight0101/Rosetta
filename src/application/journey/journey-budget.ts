import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Amount, ApprovedAmount } from '../../domain/budget/approved-amount.js';
import type { Run } from '../../domain/runs/run.js';
import { journeyRemaining } from '../../domain/journey/journey-record.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { scopeOf } from '../runs/run-scope.js';
import { readUnderstandOptions } from '../understand/understand-options.js';

// RF-435, ADR-027: a step of the project's journey runs under what is left of the one approved
// amount. A project with no journey (a run started by the evaluation tools) has no such line.

export interface JourneyBudgetDependencies {
  readonly journeys?: JourneyRecords | undefined;
  readonly runs: Pick<RunIndex, 'list'>;
  /** P8-03: the manifests of the journey's steps, to reserve what an unfinished step may still use. */
  readonly manifests?: Pick<RunManifestStore, 'read'> | undefined;
}

/** The steps of the journey that are queued, running or paused: they may still use their lines. */
function inFlight(runs: readonly Run[], since: number): readonly Run[] {
  return runs.filter(
    (run) =>
      run.endState === null &&
      (run.stage === 'understand' || run.stage === 'plan') &&
      run.queuedAt >= since,
  );
}

/**
 * P8-03: what the steps in flight may still use of their own lines (the amount their manifests
 * record, less what they spent). It is held back from a new step, so the lines never add up to more
 * than the approved amount.
 */
async function reservedBy(deps: JourneyBudgetDependencies, steps: readonly Run[]): Promise<Amount> {
  const reserved = { tokens: 0, costMicros: 0 };
  if (deps.manifests === undefined) return reserved;
  for (const run of steps) {
    const manifest = await deps.manifests.read(scopeOf(run));
    const line =
      manifest === undefined ? undefined : readUnderstandOptions(manifest.options).approvedAmount;
    if (line === undefined) continue;
    const spent = run.totals.inputTokens + run.totals.outputTokens;
    reserved.tokens += Math.max(0, line.tokens - spent);
    reserved.costMicros += Math.max(0, line.costMicros - run.totals.costMicros);
  }
  return reserved;
}

/** A step's line, and whether the journey's approved amount is used up. */
export interface StepLine {
  readonly amount: ApprovedAmount;
  /** P9-02: the one amount the owner approved, of which `amount` is what a new step may use. */
  readonly approved: Amount;
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
  const runs = await deps.runs.list(owner.userId, owner.projectId);
  const left: Amount = journeyRemaining(record, runs);
  const held = await reservedBy(deps, inFlight(runs, record.createdAt));
  const free = {
    tokens: Math.max(0, left.tokens - held.tokens),
    costMicros: Math.max(0, left.costMicros - held.costMicros),
  };
  // Nothing to run on: no tokens, or no dollars in an amount that has dollars.
  const usedUp = free.tokens <= 0 || (record.approved.costMicros > 0 && free.costMicros <= 0);
  return { amount: free, approved: record.approved, usedUp };
}

/** The amount a new step may use: the journey's remainder; undefined when the project has no journey. */
// RF-435
export async function stepAmountOf(
  deps: JourneyBudgetDependencies,
  owner: { readonly userId: string; readonly projectId: string },
): Promise<ApprovedAmount | undefined> {
  return (await stepLineOf(deps, owner))?.amount;
}

/** P8-03: the line of a new step, or the refusal when nothing is left of the journey's amount. */
// RF-435
export async function stepAmountChecked(
  deps: JourneyBudgetDependencies,
  owner: { readonly userId: string; readonly projectId: string },
): Promise<Result<ApprovedAmount | undefined, typeof ERROR_CODES.journeyAmountUsed>> {
  const line = await stepLineOf(deps, owner);
  if (line === undefined) return ok(undefined);
  return line.usedUp ? err(ERROR_CODES.journeyAmountUsed) : ok(line.amount);
}

/** RF-011, DEC-204: pressing Analyse (a start that showed its figure) records the journey. */
export async function recordJourney(
  journeys: Pick<JourneyRecords, 'save'> | undefined,
  owner: { readonly userId: string; readonly projectId: string },
  approved: ApprovedAmount | undefined,
  createdAt: number,
): Promise<void> {
  if (approved === undefined) return;
  await journeys?.save({
    ...owner,
    approved: { tokens: approved.tokens, costMicros: approved.costMicros },
    createdAt,
  });
}
