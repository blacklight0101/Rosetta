import type { CalibrationModelResult } from '../../application/eval/calibration-results.js';
import type { CalibrationSummary } from '../../application/eval/run-calibration.js';
import type { CalibrationOutcome } from '../../domain/eval/verifier-agreement.js';

// RF-305, DEC-57: what `npm run eval -- --calibration` prints: for each model its agreement rate with
// the hand labels, the two kinds of error, and every disagreement with the verifier's reason, so the
// owner sees how far to trust each model as a verifier and which claims it got wrong.

function rate(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(3);
}

function disagreementLine(each: CalibrationOutcome): string {
  const judged = each.verdict === 'Unverified' ? 'not judged' : `judged ${each.verdict}`;
  return `  ${each.claimId} labelled ${each.label}, ${judged}: ${each.reason}`;
}

function modelLines(result: CalibrationModelResult): string[] {
  const { provider, model, claims, agreed } = result;
  const ended = result.endState === 'Completed' ? '' : ` Ended early: ${result.endState}.`;
  const errors = [
    `${String(result.falseSupported)} called Supported against the label`,
    `${String(result.falseRejected)} called Rejected against the label`,
    `${String(result.unjudged)} not judged`,
  ].join(', ');
  const share = `agreement ${rate(result.agreementRate)} (${String(agreed)} of ${String(claims)} claims)`;
  return [
    `${provider} ${model}: ${share}; ${errors}.${ended}`,
    ...result.disagreements.map(disagreementLine),
  ];
}

// RF-305
export function calibrationReport(summary: CalibrationSummary): string[] {
  return [
    `Calibration written to ${summary.folder}`,
    ...summary.results.models.flatMap(modelLines),
  ];
}
