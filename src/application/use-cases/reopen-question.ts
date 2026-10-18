import type { Actor } from '../../domain/accounts/actor.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { Logger } from '../ports/logger.js';
import type { PriorCards, QuestionReopener } from '../ports/prior-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import { askingTheSame } from '../understand/answer-rerun.js';
import { withStates, type StatedQuestion } from './question-states.js';

// RF-241, RF-1007, RF-1105: Reopen question lets the user open a question that a re-run marked
// `Answered` again, so an answer edited after that is used by the next re-run with answers (a re-run
// skips an Answered question). A question several areas asked is one question with a card in each
// area: every card behind it that is Answered is opened. The reopening is logged; a run's event log
// is closed once the run ended (data-model.md section 3.9), so it cannot hold it. A run that has not ended is refused: its agents are still writing the cards (P2-44). Another user's run
// id, an unknown run and a card id the run has no question for give the same answer.

export interface ReopenQuestionDependencies {
  readonly runs: RunIndex;
  readonly answers: AnswersFile;
  readonly cards: PriorCards & QuestionReopener;
  readonly logger: Logger;
}

export type ReopenQuestionProblem = 'not-found' | 'run-not-ended';

export class ReopenQuestion {
  private readonly deps: ReopenQuestionDependencies;

  constructor(deps: ReopenQuestionDependencies) {
    this.deps = deps;
  }

  // RF-241, RF-1007, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
    readonly cardId: string;
  }): Promise<Result<readonly StatedQuestion[], ReopenQuestionProblem>> {
    const { runs, answers, cards } = this.deps;
    const run = await runs.find(request.actor.userId, request.runId);
    if (run === undefined) return err('not-found');
    const project = { userId: run.userId, projectId: run.projectId };
    const questions = await answers.questionsOf(project, run.runKey);
    if (!questions.some((question) => question.cardId === request.cardId)) return err('not-found');
    if (run.queueState !== 'Ended') return err('run-not-ended');
    const earlier = await cards.cardsOf(project, run.runKey);
    const card = earlier.find((each) => each.id === request.cardId && each.type === 'OQ');
    const answered = (card === undefined ? [] : askingTheSame(card, earlier))
      .filter((each) => each.questionState === 'Answered')
      .map((each) => each.id);
    const reopened = answered.length === 0 ? [] : await cards.reopen(project, run.runKey, answered);
    if (reopened.length > 0) await this.log(run, request.cardId, reopened);
    return ok(await withStates(cards, project, run.runKey, questions));
  }

  private async log(
    run: { readonly runKey: string; readonly userId: string },
    cardId: string,
    reopened: readonly string[],
  ): Promise<void> {
    await this.deps.logger.log({
      level: 'info',
      logger: 'understand',
      message: `The question ${cardId} of run ${run.runKey} was reopened: the next re-run with answers uses its answer.`,
      runId: run.runKey,
      userId: run.userId,
      data: { cardId, cards: [...reopened] },
    });
  }
}
