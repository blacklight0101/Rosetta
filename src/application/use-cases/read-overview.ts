import type { Actor } from '../../domain/accounts/actor.js';
import type { Overview } from '../../domain/overview/overview.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { parseOverview } from '../overview/overview-file.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-264, RF-1105: Read overview gives the run page the overview of an understand run, read from the
// run's `overview.json`. A run without one (still running, another stage, or an older run) gives
// `undefined`. Another user's run id and an unknown id give the same answer, `not-found`.

export interface ReadOverviewDependencies {
  readonly runs: RunIndex;
  readonly files: RunTextFiles;
}

export class ReadOverview {
  private readonly deps: ReadOverviewDependencies;

  constructor(deps: ReadOverviewDependencies) {
    this.deps = deps;
  }

  // RF-264, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<Overview | undefined, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    return ok(parseOverview(await this.deps.files.read(scopeOf(run), 'overview.json')));
  }
}
