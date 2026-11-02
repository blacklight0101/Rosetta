import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import type { AnswerProgress, KeptAnswers, PlannerAnswers } from '../ports/planner-answers.js';
import type { RunScope } from '../ports/run-events.js';
import { scopeOf } from '../runs/run-scope.js';
import type { PlanInputs } from './plan-inputs.js';
import { planPromptVersions, type PlanFiles } from './plan-prompts.js';

// RF-432, RF-006, RF-408, P8-01: the answers of one plan run, as the run goes. A plan run asks its
// calls in the same order each time, so the n-th call of an agent task is the same call after a
// pause; an answer kept by an earlier attempt of the run is handed back and not asked for again,
// and each new answer is kept as soon as it is complete. A cut-off answer keeps each segment it paid
// for, so a continued run goes on from there. The answers are bound to a fingerprint of the run's
// inputs (the brief, the questions and their answers, the cards, the project settings, the source
// run, the catalogue and the prompts): when any of them changed during a pause, every kept answer
// is dropped and the run asks again. Call ids go on from the last one the run took, so no two
// calls of a run share one.

/** Asks for an answer, starting from what was paid for already; `keep` records each new segment. */
export type AnswerAsk = (
  progress: AnswerProgress | undefined,
  keep: (progress: AnswerProgress) => Promise<void>,
) => Promise<string>;

/** How the book opened: answers read back, answers dropped for changed inputs, or none kept. */
export type BookStart = 'reused' | 'discarded' | 'empty';

export class PlannerAnswerBook {
  private readonly counts = new Map<string, number>();
  private readonly store: PlannerAnswers;
  private readonly scope: RunScope;
  private kept: KeptAnswers;
  private writes: Promise<void> = Promise.resolve();
  /** How the book opened, and how many answers it held then. */
  readonly start: { readonly state: BookStart; readonly answers: number };

  private constructor(
    store: PlannerAnswers,
    scope: RunScope,
    kept: KeptAnswers,
    start: PlannerAnswerBook['start'],
  ) {
    this.store = store;
    this.scope = scope;
    this.kept = kept;
    this.start = start;
  }

  /** The book of the run, with the answers its earlier attempts kept for these same inputs. */
  static async open(
    store: PlannerAnswers,
    scope: RunScope,
    inputs: string,
  ): Promise<PlannerAnswerBook> {
    const fingerprint = store.fingerprint(inputs);
    const read = await store.read(scope);
    const fresh = {
      inputs: fingerprint,
      callsTaken: read?.callsTaken ?? 0,
      answers: {},
      progress: {},
    };
    if (read === undefined)
      return new PlannerAnswerBook(store, scope, fresh, { state: 'empty', answers: 0 });
    const answers = Object.keys(read.answers).length;
    if (read.inputs === fingerprint) {
      return new PlannerAnswerBook(store, scope, read, { state: 'reused', answers });
    }
    // The inputs changed during the pause: no answer is handed back, the call ids go on.
    return new PlannerAnswerBook(store, scope, fresh, { state: 'discarded', answers });
  }

  // RF-408
  /** `<runKey>#<n>`, numbered on from the calls the run's earlier attempts took. */
  callIds(run: Run): () => string {
    return () => {
      const taken = this.kept.callsTaken + 1;
      this.kept = { ...this.kept, callsTaken: taken };
      this.save();
      // A failed write is reported by the next answer that waits for it, never left unhandled.
      this.writes.catch(() => undefined);
      return `${run.runKey}#${String(taken)}`;
    };
  }

  // RF-432
  /** The kept answer of the next call of the task, or the one `ask` gets, which is then kept. */
  async answerOf(agentTaskId: string, ask: AnswerAsk): Promise<string> {
    const place = (this.counts.get(agentTaskId) ?? 0) + 1;
    this.counts.set(agentTaskId, place);
    const key = `${agentTaskId}#${String(place)}`;
    const kept = this.kept.answers[key];
    if (kept !== undefined) return kept;
    const answer = await ask(this.kept.progress[key], async (progress) => {
      this.kept = { ...this.kept, progress: { ...this.kept.progress, [key]: progress } };
      await this.saved();
    });
    const progress = Object.fromEntries(
      Object.entries(this.kept.progress).filter(([each]) => each !== key),
    );
    this.kept = { ...this.kept, answers: { ...this.kept.answers, [key]: answer }, progress };
    await this.saved();
    return answer;
  }

  /** Waits for every write the book has started. */
  saved(): Promise<void> {
    this.save();
    return this.writes;
  }

  private save(): void {
    this.writes = this.writes.then(() => this.store.write(this.scope, this.kept));
  }
}

/** RF-432: the text the fingerprint of a plan run's inputs is taken from. */
export function planInputsText(inputs: PlanInputs, files: PlanFiles): string {
  const { brief, questions, cards, project, sourceRun } = inputs;
  const { version, sha256 } = files.catalogue;
  return JSON.stringify({
    ...{ brief, questions, cards, settings: project.settings, sourceRun: sourceRun.id },
    ...{ catalogue: { version, sha256 }, prompts: planPromptVersions(files) },
  });
}

export interface PlannerAnswerDependencies {
  /** RF-432, P8-01: the answers a paused plan run already paid for, read back when it continues. */
  readonly plannerAnswers: PlannerAnswers;
  readonly logger: Logger;
}

const startMessage: Readonly<Record<BookStart, (answers: number) => string>> = {
  reused: (n) => `The run continues with ${String(n)} planner answer(s) it already paid for.`,
  discarded: (n) =>
    `The brief, the answers, the cards or the settings changed while the run was paused, so its ${String(n)} earlier planner answer(s) are not used and the planner is asked again.`,
  empty: () => '',
};

/** RF-432: the book of a plan run; a run that continues says what it does with its kept answers. */
export async function openAnswerBook(
  deps: PlannerAnswerDependencies,
  run: Run,
  inputs: string,
): Promise<PlannerAnswerBook> {
  const book = await PlannerAnswerBook.open(deps.plannerAnswers, scopeOf(run), inputs);
  const { state, answers } = book.start;
  if (answers > 0 && state !== 'empty') {
    await deps.logger.log({
      ...{ level: state === 'discarded' ? 'warn' : 'info', logger: 'plan' },
      ...{ runId: run.runKey, userId: run.userId, message: startMessage[state](answers) },
    });
  }
  return book;
}
