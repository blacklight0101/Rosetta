import type { JourneyFacts } from '../../api/journey-schemas.js';
import { costLabel, leftLabel, tokensLabel } from './format.js';

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
  readonly unit: 'micros' | 'tokens';
}

/** The journey's approved amount; none for a project without a journey. */
// RF-1003
export function approvedLineOf(budget: JourneyFacts['budget']): ApprovedLine | undefined {
  return budget ?? undefined;
}

/** What is left after the run spent more since the line was read, never below zero. */
// RF-1003
export function lineAfter(
  line: ApprovedLine,
  spent: { readonly micros: number; readonly tokens: number },
): ApprovedLine {
  return {
    ...line,
    remainingMicros: Math.max(0, line.remainingMicros - spent.micros),
    remainingTokens: Math.max(0, line.remainingTokens - spent.tokens),
  };
}

/** A journey with no dollars in its amount (local models) is counted in tokens. */
// RF-1003
export function approvedViewOf(
  line: ApprovedLine | undefined,
  unit: 'micros' | 'tokens',
): ApprovedView | undefined {
  if (line === undefined) return undefined;
  if (unit === 'tokens' || line.approvedMicros === 0) {
    return {
      text: `${tokensLabel(line.remainingTokens)} tokens left of ${tokensLabel(line.approvedTokens)} approved`,
      spent: line.approvedTokens - line.remainingTokens,
      cap: line.approvedTokens,
      unit: 'tokens',
    };
  }
  return {
    text: `${leftLabel(line.remainingMicros)} left of ${costLabel(line.approvedMicros)} approved`,
    spent: line.approvedMicros - line.remainingMicros,
    cap: line.approvedMicros,
    unit: 'micros',
  };
}
