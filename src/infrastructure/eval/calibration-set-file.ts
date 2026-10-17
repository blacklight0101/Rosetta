import { err, type Result } from '../../domain/errors/result.js';
import type { CalibrationSet } from '../../application/eval/calibration-set-schema.js';

// RF-305, DEC-57: stub, filled in by the next commit.

export interface LoadedCalibrationSet {
  readonly set: CalibrationSet;
  readonly sha256: string;
}

export function loadCalibrationSet(
  folder: string,
  reference: string,
): Promise<Result<LoadedCalibrationSet, string>> {
  return Promise.resolve(err(`not built: ${folder} ${reference}`));
}
