import type { JourneyFacts, JourneyRunFacts } from '../../api/journey-schemas.js';
import { costLabel, leftLabel } from '../live-run/format.js';

// RF-1021, RF-428: how the journey writes what its steps cost and what is left of the approved amount.

export const NO_COST = 'No cost';

export interface StepCost {
  /** The cost as words, or as the amount written by the one formatter. */
  readonly text: string;
  /** The micro-dollars behind `text` when it is an amount, so the page can give the exact figure. */
  readonly micros: number | undefined;
}

/** The cost of each step that has one; a step without an entry costs nothing to show. */
export function stepCostsOf(
  source: JourneyFacts['source'],
  plan: JourneyRunFacts | null,
): Readonly<Record<string, StepCost>> {
  return {
    scan: { text: 'No model cost', micros: undefined },
    understand:
      source === null
        ? { text: NO_COST, micros: undefined }
        : { text: costLabel(source.costMicros), micros: source.costMicros },
    plan:
      plan === null
        ? { text: 'No cost yet', micros: undefined }
        : { text: costLabel(plan.costMicros), micros: plan.costMicros },
    package: { text: 'Included in the plan', micros: undefined },
  };
}

/** RF-1021: "$0.60 left of $1.00 approved", the amount left rounded down (DEC-206). */
export function leftText(facts: JourneyFacts): string | undefined {
  const { budget } = facts;
  if (budget === null || budget === undefined) return undefined;
  return `${leftLabel(budget.remainingMicros)} left of ${costLabel(budget.approvedMicros)} approved`;
}

/** P9-08, RF-1020: the journey's spend as the server counts it; without a journey record, the source run and the plan. */
export function journeySpentOf(facts: JourneyFacts): number {
  const spent = facts.budget?.spentMicros;
  return spent ?? (facts.source?.costMicros ?? 0) + (facts.plan?.costMicros ?? 0);
}
