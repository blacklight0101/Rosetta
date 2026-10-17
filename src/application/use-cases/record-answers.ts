import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswerEntry, AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import { withStates, type StatedQuestion } from './question-states.js';

// RF-1007, RF-240, RF-1105, DEC-15: Record answers writes the user's answers to open questions of
// one run into the project's `answers.md`; the other answers in the file are kept. A card id the
// run has no question for changes nothing. Another user's run id and an unknown id give the same
// answer. Marking the questions answered is the re-run's work (RF-241).

export interface RecordAnswersDependencies {
  readonly runs: RunIndex;
  readonly answers: AnswersFile;
  readonly cards: PriorCards;
}

export type RecordAnswersProblem = 'not-found' | 'unknown-question';

export class RecordAnswers {
  private readonly deps: RecordAnswersDependencies;

  constructor(deps: RecordAnswersDependencies) {
    this.deps = deps;
  }

  // RF-1007, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly answers: readonly AnswerEntry[];
  }): Promise<Result<readonly StatedQuestion[], RecordAnswersProblem>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const project = { userId: run.userId, projectId: run.projectId };
    const recorded = await this.deps.answers.recordAnswers(project, run.runKey, request.answers);
    if (!recorded.ok) return recorded;
    return ok(await withStates(this.deps.cards, project, run.runKey, recorded.value));
  }
}
