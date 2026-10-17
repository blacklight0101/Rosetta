import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import { withStates, type StatedQuestion } from './question-states.js';

// RF-1007, RF-240, RF-1105: List answers gives the live run page the open questions the run added
// to its project's `answers.md`, with the answers recorded so far
// and the state of each (RF-241). Another user's run id and an
// unknown id give the same answer.

export interface ListAnswersDependencies {
  readonly runs: RunIndex;
  readonly answers: AnswersFile;
  readonly cards: PriorCards;
}

export class ListAnswers {
  private readonly deps: ListAnswersDependencies;

  constructor(deps: ListAnswersDependencies) {
    this.deps = deps;
  }

  // RF-1007, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<readonly StatedQuestion[], 'not-found'>> {
    const run = await this.deps.runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const project = { userId: run.userId, projectId: run.projectId };
    const questions = await this.deps.answers.questionsOf(project, run.runKey);
    return ok(await withStates(this.deps.cards, project, run.runKey, questions));
  }
}
