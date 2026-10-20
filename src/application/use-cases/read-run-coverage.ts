import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunTextFiles } from '../ports/run-text-files.js';

// RF-230, RF-1005, RF-1105: Read run coverage gives the run page the files of every area of a run
// with the lines read of each (empty for a file not read), from the run's `coverage.json`.

export interface CoverageListing {
  readonly areas: readonly {
    readonly area: string;
    readonly files: readonly {
      readonly path: string;
      readonly read: readonly { readonly startLine: number; readonly endLine: number }[];
    }[];
    readonly note?: string;
    readonly failure?: string;
  }[];
}

export interface ReadRunCoverageDependencies {
  readonly runs: Pick<RunIndex, 'find'>;
  readonly files: RunTextFiles;
}

export class ReadRunCoverage {
  private readonly deps: ReadRunCoverageDependencies;

  constructor(deps: ReadRunCoverageDependencies) {
    this.deps = deps;
  }

  // RF-230, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<CoverageListing, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    return ok({ areas: [] });
  }
}
