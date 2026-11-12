import type { Amount } from '../../domain/budget/approved-amount.js';
import { isJourneyStep, type JourneyRecord } from '../../domain/journey/journey-record.js';
import type { Run } from '../../domain/runs/run.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import { withinCeilings } from '../runs/approved-journey.js';

// RF-432, RF-435, P9-01, EV-100: Continue (+N) on a paused step of a journey raises the journey's
// approved amount by the same N, so what is left of the journey grows with the step's line and a
// later step (the plan) finds it. The journey's amount never passes the administrator ceilings;
// where they bind, N is what the journey could still take, and the run takes no more. A run that is
// not a step of a journey (no journey, a run of the evaluation tools, or a journey recorded after
// the run was queued) raises nothing and keeps its N.

/** The raise of a Continue as the journey takes it. */
export interface JourneyRaise {
  /** N: the run's N, lowered where the ceilings bind the journey. */
  readonly extra: Amount;
  /** Records the raise on the journey record. */
  apply(): Promise<void>;
  /** Puts the journey record back as it was before `apply`. */
  undo(): Promise<void>;
}

const done = (): Promise<void> => Promise.resolve();

/** RF-432: the journey's approved amount raised by N, never past the ceilings and never lowered. */
// RF-432
function raisedJourney(record: JourneyRecord, extra: Amount): JourneyRecord {
  const { tokens, costMicros } = record.approved;
  const ceiled = withinCeilings({
    tokens: tokens + Math.max(0, extra.tokens),
    costMicros: costMicros + Math.max(0, extra.costMicros),
  });
  return {
    ...record,
    approved: {
      tokens: Math.max(tokens, ceiled.tokens),
      costMicros: Math.max(costMicros, ceiled.costMicros),
    },
  };
}

/** RF-432, RF-435: the raise of the run's journey by N; nothing to raise when it is no step. */
// RF-432
export async function journeyRaiseOf(
  journeys: JourneyRecords | undefined,
  run: Run,
  extra: Amount,
): Promise<JourneyRaise> {
  const record = await journeys?.find(run.userId, run.projectId);
  if (journeys === undefined || record === undefined || !isJourneyStep(record, run)) {
    return { extra, apply: done, undo: done };
  }
  const raised = raisedJourney(record, extra);
  return {
    extra: {
      tokens: raised.approved.tokens - record.approved.tokens,
      costMicros: raised.approved.costMicros - record.approved.costMicros,
    },
    apply: () => journeys.save(raised),
    undo: () => journeys.save(record),
  };
}
