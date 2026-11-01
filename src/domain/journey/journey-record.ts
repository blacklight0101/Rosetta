import type { EpochMs } from '../accounts/user.js';
import type { Amount } from '../budget/approved-amount.js';
import type { Run } from '../runs/run.js';

// RF-011, RF-435, ADR-027, DEC-196, DEC-205: the journey of a project. It records the one amount
// the owner approved (the worst-case total of the journey estimate) and when. Its steps are the
// project's understand and plan runs queued since then; its spend is their cost and tokens, and
// what is left is the line every step runs under. A scan is free and never counts.

export interface JourneyRecord {
  readonly userId: string;
  readonly projectId: string;
  readonly approved: Amount;
  /** When the owner pressed Analyse; the first step's queue time. */
  readonly createdAt: EpochMs;
}

/** The runs that are steps of the journey: understand and plan runs queued at or after its start. */
function stepsOf(record: JourneyRecord, runs: readonly Run[]): readonly Run[] {
  return runs.filter(
    (run) =>
      run.projectId === record.projectId &&
      (run.stage === 'understand' || run.stage === 'plan') &&
      run.queuedAt >= record.createdAt,
  );
}

/** RF-011: the sum of what the steps have used. */
export function journeySpend(record: JourneyRecord, runs: readonly Run[]): Amount {
  return stepsOf(record, runs).reduce<Amount>(
    (sum, run) => ({
      tokens: sum.tokens + run.totals.inputTokens + run.totals.outputTokens,
      costMicros: sum.costMicros + run.totals.costMicros,
    }),
    { tokens: 0, costMicros: 0 },
  );
}

/** RF-435: what is left of the approved amount, never below zero. */
export function journeyRemaining(record: JourneyRecord, runs: readonly Run[]): Amount {
  const spent = journeySpend(record, runs);
  return {
    tokens: Math.max(0, record.approved.tokens - spent.tokens),
    costMicros: Math.max(0, record.approved.costMicros - spent.costMicros),
  };
}
