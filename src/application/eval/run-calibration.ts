import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ClaimJudgeParts } from '../verifier/judge-claim.js';
import type { CalibrationOutput, CalibrationResults } from './calibration-results.js';
import type { CalibrationSet } from './calibration-set-schema.js';
import type { VerifierPrompts } from '../verifier/verifier-prompts.js';
import type { EvaluationProblem } from './run-evaluation.js';

// RF-305, DEC-57: stub, filled in by the next commit.

export interface CalibrationModel {
  readonly provider: string;
  readonly model: string;
  /** The judging parts of the model's `verifier` role; `onAnswer` is set by the use case. */
  readonly judge: Omit<ClaimJudgeParts, 'onAnswer'>;
}

export interface RunCalibrationDependencies {
  readonly output: CalibrationOutput;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly rosettaVersion: string;
  readonly prompts: VerifierPrompts;
}

export interface RunCalibrationRequest {
  readonly set: CalibrationSet;
  readonly setSha256: string;
  readonly models: readonly CalibrationModel[];
}

export interface CalibrationSummary {
  readonly folder: string;
  readonly results: CalibrationResults;
}

export class RunCalibration {
  private readonly deps: RunCalibrationDependencies;

  constructor(deps: RunCalibrationDependencies) {
    this.deps = deps;
  }

  execute(request: RunCalibrationRequest): Promise<Result<CalibrationSummary, EvaluationProblem>> {
    return Promise.resolve(
      err({
        code: ERROR_CODES.unexpected,
        message: `not built: ${this.deps.rosettaVersion} ${String(request.models.length)}`,
      }),
    );
  }
}
