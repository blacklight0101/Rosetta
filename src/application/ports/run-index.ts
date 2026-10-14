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

/** RF-1012: how the runs use one snapshot folder, for the administrator's snapshot list. */
export interface SnapshotUsage {
  readonly snapshotKey: string;
  /** Every run that recorded this snapshot as its source, of every user. */
  readonly runs: number;
  /** The runs among them that are queued or running. */
  readonly active: number;
  /** The latest end, start or queue instant of those runs. */
  readonly lastUsedAt: EpochMs;
}

/** RF-1008: how many runs a project has and its newest one. */
export interface ProjectRunSummary {
  readonly projectId: string;
  readonly runs: number;
  readonly latest: Run;
}

export interface RunIndex {
  /** Stores a new run; refuses a run key the project already has. */
  insert(run: Run): Promise<Result<Run, 'run-key-taken'>>;
  /** Undefined for an unknown id and for another user's run. */
  find(userId: string, runId: string): Promise<Run | undefined>;
  /** The project's runs of that user, newest first. */
  list(userId: string, projectId: string): Promise<readonly Run[]>;
  /**
   * RF-1008: the run count and the newest run of each asked project of that user, in one read
   * however many projects are asked. A project without runs, and one of another user, has none.
   */
  projectSummaries(
    userId: string,
    projectIds: readonly string[],
  ): Promise<readonly ProjectRunSummary[]>;
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
  /**
   * Removes the user's run row (RF-1012); false for an unknown id, another user's run and a run
   * that is queued or running. The cost ledger is never touched (DEC-55).
   */
  removeEnded(userId: string, runId: string): Promise<boolean>;
  /** Removes the ended runs of the user's project; the queued and running ones stay. */
  removeEndedOfProject(userId: string, projectId: string): Promise<void>;
  /** Server-wide, for the administrator only: the use of each snapshot folder, by key. */
  snapshotUsage(): Promise<readonly SnapshotUsage[]>;
}
