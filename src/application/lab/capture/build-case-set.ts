/* eslint-disable @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191) */
import { err, type Result } from '../../../domain/errors/result.js';
import type { LabCaseSet, LabCaseSource } from '../lab-case-set.js';
import type { CapturedRun } from './capture-types.js';
import type { Sha256 } from './held-back.js';

// RF-1404, RF-1405: stub, the behaviour comes with the feature commit.

export interface CaptureRequest {
  readonly prompt: string;
  readonly name: string;
  readonly description: string;
  readonly maxPerRun: number;
  readonly sha256: Sha256;
  readonly runs: readonly {
    readonly source: Omit<LabCaseSource, 'runs'>;
    readonly run: CapturedRun;
  }[];
}

export interface Captured {
  readonly set: LabCaseSet;
  readonly leftOut: readonly string[];
}

// RF-1404
export function buildCaseSet(_request: CaptureRequest): Result<Captured, string> {
  return err('not implemented');
}
