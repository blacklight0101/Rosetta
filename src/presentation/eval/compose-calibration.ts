import type { CalibrationSummary } from '../../application/eval/run-calibration.js';
import type { EvaluationProblem } from '../../application/eval/run-evaluation.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { LoadedCalibrationSet } from '../../infrastructure/eval/calibration-set-file.js';
import type { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import type { ServerKeys } from '../../infrastructure/providers/provider-access.js';
import type { GuardedFactoryMaker } from '../compose-providers.js';

// RF-305, DEC-57: stub, filled in by the next commit.

export interface CalibrationParts {
  readonly outputDir: string;
  /** The folder the set's `source.folder` is relative to: the Rosetta repository. */
  readonly repositoryRoot: string;
  readonly promptsFolder: string;
  readonly providers: GuardedFactoryMaker;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly priceTable: PriceTable;
  /** The project settings the models are chosen in (the template). */
  readonly settings: ProjectSettings;
  readonly capMicros: number;
  readonly rosettaVersion: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly masker: SecretMasker;
}

export interface CalibrationRole {
  readonly provider: string;
  readonly model: string;
}

export function runCalibration(
  parts: CalibrationParts,
  loaded: LoadedCalibrationSet,
  models: readonly CalibrationRole[],
): Promise<Result<CalibrationSummary, EvaluationProblem>> {
  return Promise.resolve(
    err({
      code: ERROR_CODES.unexpected,
      message: `not built: ${parts.outputDir} ${loaded.sha256} ${String(models.length)}`,
    }),
  );
}
