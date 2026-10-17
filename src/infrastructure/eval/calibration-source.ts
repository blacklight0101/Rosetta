import type { Logger } from '../../application/ports/logger.js';
import type { RepositoryReader } from '../../application/ports/repository-reader.js';
import { err, type Result } from '../../domain/errors/result.js';

// RF-305, RF-005: stub, filled in by the next commit.

export function openCalibrationSource(
  repositoryRoot: string,
  folder: string,
  logger: Logger,
): Promise<Result<RepositoryReader, string>> {
  return Promise.resolve(
    err(`not built: ${repositoryRoot} ${folder} ${logger.constructor.name.slice(0, 0)}`),
  );
}
