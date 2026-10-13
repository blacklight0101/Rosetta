import type { EpochMs } from '../../domain/accounts/user.js';
import type { Result } from '../../domain/errors/result.js';
import type { Run, RunTotals } from '../../domain/runs/run.js';
import type { RunEndState } from '../../domain/runs/run-states.js';

// Architecture section 7, data-model.md section 4 (`runs`), RF-1108, RF-1105: the run rows. The
// operations a user triggers (`find`, `list`) take the owner's id and see only that user's rows,
// so another user's run id finds nothing. The queue works across users and uses the server-wide
// operations (`listQueued`, `listRunning` and the transitions by run id); they are never reachable
// from a request without an owner check first.

export interface RunSource {
  readonly commitSha: string;
  /** The snapshot folder name (data-model.md section 3.3). */
  readonly snapshotKey: string;
}

export interface RunIndex {
  /** Stores a new run; refuses a run key the project already has. */
  insert(run: Run): Promise<Result<Run, 'run-key-taken'>>;
  /** Undefined for an unknown id and for another user's run. */
  find(userId: string, runId: string): Promise<Run | undefined>;
  /**
   * RF-1011, RF-1105: true when a run of another user has that run key. A run key is unique per
   * project only, so a log entry that names a key and no user is the run's own only while this
   * is false.
   */
  keyUsedByOthers(userId: string, runKey: string): Promise<boolean>;
  /** The project's runs of that user, newest first. */
  list(userId: string, projectId: string): Promise<readonly Run[]>;
  /** Every queued run of every user, in queue order. */
  listQueued(): Promise<readonly Run[]>;
  /** Every running run of every user, oldest start first. */
  listRunning(): Promise<readonly Run[]>;
  /** `Queued` -> `Running`; undefined for an unknown run and for one that is not queued. */
  start(runId: string, at: EpochMs): Promise<Run | undefined>;
  /**
   * `Running` -> `Ended`, or `Queued` -> `Ended` as `Interrupted`; the end state is set once.
   * Undefined for an unknown run, one that has ended and a queued run ended any other way.
   */
  end(runId: string, endState: RunEndState, at: EpochMs): Promise<Run | undefined>;
  /** Records the pinned commit and the snapshot folder; undefined for an unknown or ended run. */
  recordSource(runId: string, source: RunSource): Promise<Run | undefined>;
  /** Replaces the running totals; undefined for an unknown or ended run. */
  recordTotals(runId: string, totals: RunTotals): Promise<Run | undefined>;
}
