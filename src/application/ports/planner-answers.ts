import type { RunScope } from './run-events.js';

// RF-432, RF-006, P8-01, data-model.md section 3.7c: the planner answers a plan run has paid for,
// kept in its run folder, so a plan that pauses at its approved amount and is continued reads them
// back instead of paying for them again. Each answer is keyed by its agent task and its place among
// that task's calls (`planner-package#1`), as the run asks them in the same order every time.

export interface PlannerAnswers {
  /** The run's kept answers by key; empty when the run has kept none. */
  read(scope: RunScope): Promise<Readonly<Record<string, string>>>;
  /** Replaces the run's kept answers; rejects with the writer's code when they cannot be stored. */
  write(scope: RunScope, answers: Readonly<Record<string, string>>): Promise<void>;
}
