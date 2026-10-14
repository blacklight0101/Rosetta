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
// A queued run also gets its place in the server's queue (RF-1108, P1-106). Another user's run id and
// an unknown id give the same answer.

/** Where a queued run stands in the server's queue (the run queue implements it). */
export interface QueuePositions {
  /** Counted from 1; undefined when the run is not queued. */
  positionOf(runId: string): Promise<number | undefined>;
}

export interface GetRunDependencies {
  readonly runs: RunIndex;
  readonly queue: QueuePositions;
  /** Where the run folder is looked at for `report/report.md`. */
  readonly files: RunTextFiles;
}

export interface RunDetail {
  readonly run: Run;
  /** True when the run folder holds the report that Build report writes (RF-504). */
  readonly reportBuilt: boolean;
  /** The place of a queued run in the server's queue, counted from 1; null for any other run. */
  readonly position: number | null;
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
    const [reportBuilt, position] = await Promise.all([this.reportBuilt(run), this.position(run)]);
    return ok({ run, reportBuilt, position });
  }

  /** Only a queued run has a place; the queue is not asked about any other. */
  private async position(run: Run): Promise<number | null> {
    if (run.queueState !== 'Queued') return null;
    return (await this.deps.queue.positionOf(run.id)) ?? null;
  }

  private async reportBuilt(run: Run): Promise<boolean> {
    if (run.queueState !== 'Ended') return false;
    return (await this.deps.files.read(scopeOf(run), reportFile)) !== undefined;
  }
}
