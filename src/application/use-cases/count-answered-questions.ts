import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import { askingTheSame } from '../understand/answer-rerun.js';

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
    const cardsOf = new Map(runs.map((runKey, index) => [runKey, earlier[index] ?? []]));
    const waiting = answered.filter((question) => {
      const cards = cardsOf.get(question.runKey) ?? [];
      const card = cards.find((each) => each.id === question.cardId && each.type === 'OQ');
      // A merged question waits while any card behind it is still Open.
      return (
        card !== undefined && askingTheSame(card, cards).some((c) => c.questionState !== 'Answered')
      );
    });
    return ok(waiting.length);
  }
}
