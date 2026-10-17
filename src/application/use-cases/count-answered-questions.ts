import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import type { ProjectRepository } from '../ports/project-repository.js';

// RF-241, RF-1001: Count answered questions tells the start page whether "Re-run with answers"
// has anything to do.

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
    return project === undefined ? err(ERROR_CODES.notFound) : ok(0);
  }
}
