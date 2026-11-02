import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import type { PlannerAnswers } from '../ports/planner-answers.js';
import { scopeOf } from '../runs/run-scope.js';
import type { RunScope } from '../ports/run-events.js';

// RF-432, RF-006, P8-01: the answers of one plan run, as the run goes. A plan run asks its calls in
// the same order each time, so the n-th call of an agent task is the same call after a pause; an
// answer kept by an earlier attempt of the run is handed back and not asked for again, and each new
// answer is kept as soon as it is complete. A call refused or cut short keeps nothing.

export class PlannerAnswerBook {
  private readonly counts = new Map<string, number>();
  private readonly store: PlannerAnswers;
  private readonly scope: RunScope;
  private kept: Readonly<Record<string, string>>;

  private constructor(
    store: PlannerAnswers,
    scope: RunScope,
    kept: Readonly<Record<string, string>>,
  ) {
    this.store = store;
    this.scope = scope;
    this.kept = kept;
  }

  /** The book of the run, with the answers its earlier attempts kept. */
  static async open(store: PlannerAnswers, scope: RunScope): Promise<PlannerAnswerBook> {
    return new PlannerAnswerBook(store, scope, await store.read(scope));
  }

  /** How many kept answers the run had when it began. */
  get keptCount(): number {
    return Object.keys(this.kept).length;
  }

  // RF-432
  /** The kept answer of the next call of the task, or the one `ask` gets, which is then kept. */
  async answerOf(agentTaskId: string, ask: () => Promise<string>): Promise<string> {
    const place = (this.counts.get(agentTaskId) ?? 0) + 1;
    this.counts.set(agentTaskId, place);
    const key = `${agentTaskId}#${String(place)}`;
    const kept = this.kept[key];
    if (kept !== undefined) return kept;
    const answer = await ask();
    this.kept = { ...this.kept, [key]: answer };
    await this.store.write(this.scope, this.kept);
    return answer;
  }
}

export interface PlannerAnswerDependencies {
  /** RF-432, P8-01: the answers a paused plan run already paid for, read back when it continues. */
  readonly plannerAnswers: PlannerAnswers;
  readonly logger: Logger;
}

/** RF-432: the book of a plan run; a run that continues says how many answers it reads back. */
export async function openAnswerBook(
  deps: PlannerAnswerDependencies,
  run: Run,
): Promise<PlannerAnswerBook> {
  const book = await PlannerAnswerBook.open(deps.plannerAnswers, scopeOf(run));
  if (book.keptCount > 0) {
    await deps.logger.log({
      ...{ level: 'info', logger: 'plan', runId: run.runKey, userId: run.userId },
      message: `The run continues with ${String(book.keptCount)} planner answer(s) it already paid for.`,
    });
  }
  return book;
}
