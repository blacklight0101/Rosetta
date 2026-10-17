import type { EvaluationSummary } from '../../application/eval/run-evaluation.js';

// RF-260, RF-261, RF-262, RNF-006: the lines `npm run eval` prints for a finished evaluation.

// RNF-006
export function reportLines(summary: EvaluationSummary): string[] {
  return [`Evaluation written to ${summary.folder}`];
}
