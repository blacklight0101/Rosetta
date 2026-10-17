import type { CalibrationSummary } from '../../application/eval/run-calibration.js';

// RF-305: stub, filled in by the next commit.

export function calibrationReport(summary: CalibrationSummary): string[] {
  return [`not built: ${summary.folder}`];
}
