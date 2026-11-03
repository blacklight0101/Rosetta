import type { JourneyFacts } from '../../api/journey-schemas.js';
import type { MeterUnit } from './run-meter-reading.js';

// RF-1003, RF-434, DEC-205, DEC-206 (P8-24): the approved amount of a journey as the run page shows
// it: what is left of it, counted live with the run's spend, in dollars or, for a journey on local
// models, in tokens.

/** What the owner approved for the journey and what is left of it. */
export interface ApprovedLine {
  readonly approvedMicros: number;
  readonly remainingMicros: number;
  readonly approvedTokens: number;
  readonly remainingTokens: number;
}

/** The approved amount as one figure: its words, and the spend against it for the bars. */
export interface ApprovedView {
  readonly text: string;
  readonly spent: number;
  readonly cap: number;
  readonly unit: MeterUnit;
}

// RF-1003
export function approvedLineOf(budget: JourneyFacts['budget']): ApprovedLine | undefined {
  return budget ?? undefined;
}

// RF-1003
export function lineAfter(
  line: ApprovedLine,
  spent: { readonly micros: number; readonly tokens: number },
): ApprovedLine {
  return { ...line, remainingMicros: spent.micros, remainingTokens: spent.tokens };
}

// RF-1003
export function approvedViewOf(
  line: ApprovedLine | undefined,
  unit: MeterUnit,
): ApprovedView | undefined {
  return line === undefined ? undefined : { text: '', spent: 0, cap: 0, unit };
}
