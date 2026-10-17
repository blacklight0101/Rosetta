import type { EvaluationSummary } from '../../application/eval/run-evaluation.js';

// RF-260, RF-261, RF-262, RNF-006, RNF-012: the lines `npm run eval` prints for a finished
// evaluation: the headline measures of RFC-001 section 7 with their targets, then the measures of
// the flows, screens and data model, which have no target yet (the mean over the repetitions).

function mean(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(3);
}

// RNF-006
export function reportLines(summary: EvaluationSummary): string[] {
  const { results } = summary.files;
  const { precision, recall, citationValidity, estimate } = results.targets;
  const { stepRecall, screenFieldRecall, relationPrecision } = results.summary;
  return [
    `Evaluation written to ${summary.folder}`,
    `Precision of Supported claims: ${mean(precision.mean)} (target ${String(precision.target)})`,
    `Strict precision (unchecked claims count as wrong): ${mean(precision.strictMean)}; unchecked share of Supported claims: ${mean(precision.unmatchedShare)}`,
    `Recall of golden rules: ${mean(recall.mean)} (target ${String(recall.target)})`,
    `Step recall of the golden flows: ${mean(stepRecall?.mean)}`,
    `Field recall of the golden screens: ${mean(screenFieldRecall?.mean)}`,
    `Precision of the relations of the entity cards: ${mean(relationPrecision?.mean)}`,
    `Citation validity: ${mean(citationValidity.mean)} (target 1)`,
    `Estimate within 30%: ${String(estimate.within)} of ${String(estimate.measured)} measured runs`,
  ];
}
