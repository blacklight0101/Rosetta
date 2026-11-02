import type { RunScope } from './run-events.js';

// RF-432, RF-006, P8-01, data-model.md section 3.7c: the planner answers a plan run has paid for,
// kept in its run folder, so a plan that pauses at its approved amount and is continued reads them
// back instead of paying for them again. Each answer is keyed by its agent task and its place among
// that task's calls (`planner-package#1`), as the run asks them in the same order every time. The
// answers are bound to a fingerprint of the inputs they were asked from: answers kept for other
// inputs are never handed back.

/** The part of a cut-off answer already paid for, and how many continuations it took. */
export interface AnswerProgress {
  readonly text: string;
  readonly continued: number;
}

export interface KeptAnswers {
  /** The fingerprint of the inputs the answers were asked from (see `fingerprint`). */
  readonly inputs: string;
  /** How many call ids the run has taken (RF-408), so a continued run numbers on from there. */
  readonly callsTaken: number;
  readonly answers: Readonly<Record<string, string>>;
  /** Answers cut off at the output limit whose continuation was not made yet. */
  readonly progress: Readonly<Record<string, AnswerProgress>>;
}

export interface PlannerAnswers {
  /** The run's kept answers; undefined when the run has kept none (or none it can read). */
  read(scope: RunScope): Promise<KeptAnswers | undefined>;
  /** Replaces the run's kept answers; rejects with the writer's code when they cannot be stored. */
  write(scope: RunScope, kept: KeptAnswers): Promise<void>;
  /** A short, stable fingerprint (a hash) of the text of a run's inputs. */
  fingerprint(inputs: string): string;
}
