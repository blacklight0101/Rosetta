import type { Actor } from '../../domain/accounts/actor.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { RunEstimate } from './estimate-types.js';

// RF-425: the stub of the estimate use case.

export interface EstimateRunDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly scans: ScanResults;
  readonly keys: Pick<ProviderKeyRepository, 'find'>;
  readonly priceTable: PriceTable;
}

export interface EstimateRunRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly areas?: readonly string[];
}

export type EstimateRunProblem =
  typeof ERROR_CODES.notFound | typeof ERROR_CODES.codeMapMissing | typeof ERROR_CODES.areaUnknown;

export class EstimateRun {
  private readonly deps: EstimateRunDependencies;

  constructor(deps: EstimateRunDependencies) {
    this.deps = deps;
  }

  execute(_request: EstimateRunRequest): Promise<Result<RunEstimate, EstimateRunProblem>> {
    void this.deps;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
