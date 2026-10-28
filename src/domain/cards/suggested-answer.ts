import type { Citation } from './citation.js';

// RF-645, DEC-178: one of the suggested answers an `OQ` card offers, the way Claude Code asks. Exactly
// one is recommended and listed first; it is the default that applies when the question is skipped.

/** The fewest suggested answers an `OQ` card written after DEC-178 carries. */
export const MIN_SUGGESTED_ANSWERS = 3;

export interface SuggestedAnswer {
  /** A short answer. */
  readonly answer: string;
  /** One sentence on what the answer means and what follows from it. */
  readonly description: string;
  readonly recommended: boolean;
  /** Empty when the code does not support the answer. */
  readonly citations: readonly Citation[];
}
