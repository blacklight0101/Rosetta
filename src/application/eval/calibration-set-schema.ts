import type { Citation } from '../../domain/cards/citation.js';
import { err, type Result } from '../../domain/errors/result.js';

// RF-305, DEC-57: stub, filled in by the next commit.

export interface CalibrationClaim {
  readonly id: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  /** The hand label: whether the cited lines support the claim. */
  readonly supported: boolean;
  readonly note: string;
}

export interface CalibrationSet {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly description: string;
  /** A folder of the Rosetta repository holding the files the claims cite. */
  readonly source: { readonly folder: string };
  readonly claims: readonly CalibrationClaim[];
}

export function parseCalibrationSet(data: unknown): Result<CalibrationSet, string[]> {
  return err([`not built: ${typeof data}`]);
}
