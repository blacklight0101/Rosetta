import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';

// RF-241, RF-1001: Count answered questions tells the start page whether "Re-run with answers"
// has anything to do: the questions with an answer whose `OQ` card is still Open. A question whose
// card is gone is not counted, since a re-run skips it.

export interface CountAnsweredQuestionsDependencies {
  readonly projects: ProjectRepository;
  readonly answers: AnswersFile;
  readonly cards: PriorCards;
}

export class CountAnsweredQuestions {
  private readonly deps: CountAnsweredQuestionsDependencies;

  constructor(deps: CountAnsweredQuestionsDependencies) {
    this.deps = deps;
  }

  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<number, typeof ERROR_CODES.notFound>> {
    const project = await this.deps.projects.find(request.actor.userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const ref = { userId: project.userId, projectId: project.id };
    const answered = await this.deps.answers.answeredQuestions(ref);
    const runs = [...new Set(answered.map((question) => question.runKey))];
    const earlier = await Promise.all(runs.map((runKey) => this.deps.cards.cardsOf(ref, runKey)));
    const open = new Set(
      runs.flatMap((runKey, index) =>
        (earlier[index] ?? [])
          .filter((card) => card.type === 'OQ' && card.questionState !== 'Answered')
          .map((card) => `${runKey}/${card.id}`),
      ),
    );
    return ok(
      answered.filter((question) => open.has(`${question.runKey}/${question.cardId}`)).length,
    );
  }
}
