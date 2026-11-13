import type { CalibrationSet } from '../../eval/calibration-set-schema.js';
import type { Result } from '../../../domain/errors/result.js';

// RF-1405: the items the judge check scores.

export interface CheckItem {
  readonly id: string;
  readonly kind: 'calibration' | 'hand-scored';
  readonly family: string;
  readonly source: string;
  readonly answer: string;
  readonly label: string | null;
  /** Calibration: whether the verdict shown follows the hand label. */
  readonly followsLabel: boolean | null;
  /** Hand-scored: the hand score of each criterion. */
  readonly scores: Readonly<Record<string, number>> | null;
}

export interface HandScoredSample {
  readonly id: string;
  readonly family: string;
  readonly origin: string;
  readonly licence: string;
  readonly source: string;
  readonly answer: string;
  readonly label?: string;
  readonly scores: Readonly<Record<string, number>>;
}

// RF-1405
export function calibrationItems(
  set: CalibrationSet,
  files: Readonly<Record<string, string>>,
): CheckItem[] {
  throw new Error(`not implemented: ${set.version} ${String(Object.keys(files).length)}`);
}

// RF-1405
export function parseHandScored(data: unknown): Result<HandScoredSample[], string> {
  throw new Error(`not implemented: ${typeof data}`);
}
