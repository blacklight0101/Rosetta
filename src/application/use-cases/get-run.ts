import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-1002, RF-1105: Get run gives the live run page what the event stream does not carry: the
// run's stage and queue state before its first event, its project and its totals so far. Another
// user's run id and an unknown id give the same answer.

export interface GetRunDependencies {
  readonly runs: RunIndex;
}

export class GetRun {
  private readonly deps: GetRunDependencies;

  constructor(deps: GetRunDependencies) {
    this.deps = deps;
  }

  // RF-1002, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<Run, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    return run === undefined ? err('not-found') : ok(run);
  }
}
