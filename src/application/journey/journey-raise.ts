import type { Amount, ApprovedAmount } from '../../domain/budget/approved-amount.js';
import { isJourneyStep, type JourneyRecord } from '../../domain/journey/journey-record.js';
import type { Run } from '../../domain/runs/run.js';
import type { JourneyRecords } from '../ports/journey-records.js';
import { continuedAmount, withinCeilings } from '../runs/approved-journey.js';

// RF-432, RF-435, P9-01, EV-100: Continue (+N) on a paused step of a journey raises the journey's
// approved amount by the same N, so what is left of the journey grows with the step's line and a
// later step (the plan) finds it. The journey's amount never passes the administrator ceilings;
// where they bind, N is what the journey could still take, and the run takes no more. A run that is
// not a step of a journey (no journey, a run of the evaluation tools, or a journey recorded after
// the run was queued) raises nothing and keeps its N. DEC-206: where the journey can take none of
// N in a dimension where N has some, Continue could add nothing there: the pause offers no Continue
// (the run ends `CapReached` as at a hard ceiling) and a Continue is refused (RST-2311). A run
// queued before the current journey keeps its queue time when continued, so it stays out of it.

/** The raise of a Continue as the journey takes it. */
export interface JourneyRaise {
  /** N: the run's N, lowered where the ceilings bind the journey. */
  readonly extra: Amount;
  /** DEC-206: the journey can take none of N in a dimension where N has some. */
  readonly takesNothing: boolean;
  /** The run was queued before the current journey: its Continue keeps its queue time. */
  readonly keepsQueuedAt: boolean;
  /** Records the raise on the journey record. */
  apply(): Promise<void>;
  /** Puts the journey record back as it was before `apply`. */
  undo(): Promise<void>;
}

const done = (): Promise<void> => Promise.resolve();

/** A raise of the run alone: no journey takes any of N. */
function alone(extra: Amount, keepsQueuedAt: boolean): JourneyRaise {
  return { extra, takesNothing: false, keepsQueuedAt, apply: done, undo: done };
}

/** DEC-206: whether the journey took none of N in a dimension where N has some. */
function tookNothing(offered: Amount, taken: Amount): boolean {
  return (
    (offered.tokens > 0 && taken.tokens <= 0) || (offered.costMicros > 0 && taken.costMicros <= 0)
  );
}

/** RF-432: N as Continue offers it, at most the default N, and within the run ceilings. */
// RF-432
export function offeredExtra(approved: ApprovedAmount, extra: Amount | undefined): Amount {
  const offered = continuedAmount(approved, extra);
  return {
    tokens: offered.tokens - approved.tokens,
    costMicros: offered.costMicros - approved.costMicros,
  };
}

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
  if (journeys === undefined || record === undefined) return alone(extra, false);
  if (!isJourneyStep(record, run)) return alone(extra, run.queuedAt < record.createdAt);
  const raised = raisedJourney(record, extra);
  const taken = {
    tokens: raised.approved.tokens - record.approved.tokens,
    costMicros: raised.approved.costMicros - record.approved.costMicros,
  };
  return {
    extra: taken,
    takesNothing: tookNothing(extra, taken),
    keepsQueuedAt: false,
    apply: () => journeys.save(raised),
    undo: () => journeys.save(record),
  };
}

/**
 * RF-432, DEC-206: the N a pause offers: the default N as the run's journey can take it; undefined
 * when Continue could add nothing, so the run ends `CapReached` instead of pausing.
 */
// RF-432
export async function continueOfferOf(
  journeys: JourneyRecords | undefined,
  run: Run,
  approved: ApprovedAmount,
): Promise<Amount | undefined> {
  const raise = await journeyRaiseOf(journeys, run, offeredExtra(approved, undefined));
  return raise.takesNothing ? undefined : raise.extra;
}
