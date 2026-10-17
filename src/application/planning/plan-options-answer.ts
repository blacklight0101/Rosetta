import type { OptionsDraft } from '../../domain/planning/plan-options.js';

// RF-608, RF-609, ADR-013: the planner's answer is untrusted text. Stub until the feature commit.

/** The draft of the answer, or undefined when the answer holds no object of that shape. */
export function parsePlanOptionsAnswer(output: string): OptionsDraft | undefined {
  return output.length < 0
    ? { architecture: { recommended: '', options: [] }, stack: [] }
    : undefined;
}
