import { err, type Result } from '../../domain/errors/result.js';
import type { CalibrationOutcome } from '../../domain/eval/verifier-agreement.js';

// RF-305, data-model.md section 3.19: `calibration.json`. Stub, filled in by the next commit.

export interface CalibrationModelResult {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion: string | null;
  readonly endState: 'Completed' | 'CapReached' | 'Stopped';
  readonly claims: number;
  readonly agreed: number;
  readonly agreementRate: number | null;
  readonly falseSupported: number;
  readonly falseRejected: number;
  readonly unjudged: number;
  readonly disagreements: readonly CalibrationOutcome[];
}

export interface CalibrationResults {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly at: string;
  readonly rosettaVersion: string;
  readonly calibrationSetVersion: string;
  readonly calibrationSetSha256: string;
  readonly claims: number;
  readonly promptVersions: Readonly<Record<string, { version: string; sha256: string }>>;
  readonly models: readonly CalibrationModelResult[];
}

export interface CalibrationOutput {
  /** Writes `calibration.json` into a new folder; answers the folder written. */
  write(results: CalibrationResults): Promise<string>;
}

export function parseCalibrationResults(data: unknown): Result<CalibrationResults, string[]> {
  return err([`not built: ${typeof data}`]);
}
