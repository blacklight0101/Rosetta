import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunTextFiles } from '../ports/run-text-files.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-1002, RF-504, RF-1105: Get run gives the live run page what the event stream does not carry:
// the run's stage and queue state before its first event, its project, its totals so far and
// whether its report has been built (P1-130), so the Report step of the stepper is done on load.
// Only an ended run can have a report (DEC-131), so the folder of any other run is not read.
// Another user's run id and an unknown id give the same answer.

export interface GetRunDependencies {
  readonly runs: RunIndex;
  /** Where the run folder is looked at for `report/report.md`. */
  readonly files: RunTextFiles;
}

export interface RunDetail {
  readonly run: Run;
  /** True when the run folder holds the report that Build report writes (RF-504). */
  readonly reportBuilt: boolean;
}

/** The file of `report/` that tells a report was built; the writer always writes it. */
const reportFile = 'report/report.md';

export class GetRun {
  private readonly deps: GetRunDependencies;

  constructor(deps: GetRunDependencies) {
    this.deps = deps;
  }

  // RF-1002, RF-504, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<RunDetail, 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    return ok({ run, reportBuilt: await this.reportBuilt(run) });
  }

  private async reportBuilt(run: Run): Promise<boolean> {
    if (run.queueState !== 'Ended') return false;
    return (await this.deps.files.read(scopeOf(run), reportFile)) !== undefined;
  }
}
