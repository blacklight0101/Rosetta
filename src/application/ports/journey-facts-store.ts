import type { EpochMs } from '../../domain/accounts/user.js';
import type { Run } from '../../domain/runs/run.js';

// P8-139, DEC-226, RF-615, data-model.md section 4: the facts of the journey strip are stored by the
// code that knows them, so the journey (and the projects overview) read them from the rows and open
// no run file. The run a Deepen improves is written with the run row (RunIndex.insert); the other
// facts go through this port. A null is a fact nobody stored, read as a missing file was read.

/** What a run's end knows: the code its `run.ended` said and, for an understand run, its Supported claims. */
export interface RunEndFacts {
  readonly endCode: string | null;
  readonly supportedClaims: number | null;
}

export interface JourneyFactsStore {
  /** The folder name of the understand run the plan run is written from (the planner chose it). */
  recordPlanSource(runId: string, sourceKey: string): Promise<void>;
  /** The facts of the run's end; replaces what an earlier end of the run stored. */
  recordEnd(runId: string, facts: RunEndFacts): Promise<void>;
  /** RF-646: the open questions of one family of the user's understand runs, on each of its runs. */
  recordOpenQuestions(userId: string, runIds: readonly string[], count: number): Promise<void>;
  /** When the user's planning brief of the project was saved. */
  recordBriefSaved(userId: string, projectId: string, savedAt: EpochMs): Promise<void>;
}

/** Every stored fact of a run, as the backfill derives it from the run's files. */
export interface StoredRunFacts {
  readonly deepenParentId: string | null;
  readonly planSourceKey: string | null;
  readonly endCode: string | null;
  readonly supportedClaims: number | null;
  readonly openQuestions: number | null;
}

/** A project whose brief time was never filled. */
export interface PendingProject {
  readonly userId: string;
  readonly projectId: string;
}

/**
 * The rows that existed before the facts were stored (migration 0024) and are filled once from the
 * files. A fill never replaces a fact a writer stored since, nor the facts of the run's end when
 * the run ended again after the pass read it (P8-143), and marks the row filled even when a fact
 * stays null, so a row is read once.
 */
export interface JourneyFactsBackfill {
  /** Runs not filled yet, of every user, oldest first; at most `limit`. */
  pendingRuns(limit: number): Promise<readonly Run[]>;
  /** `read` is the run as `pendingRuns` gave it: its end time is the one the end facts belong to. */
  fillRun(read: Pick<Run, 'id' | 'endedAt'>, facts: StoredRunFacts): Promise<void>;
  /** Projects not filled yet, of every user, oldest first; at most `limit`. */
  pendingProjects(limit: number): Promise<readonly PendingProject[]>;
  fillProject(projectId: string, briefSavedAt: EpochMs | null): Promise<void>;
}
