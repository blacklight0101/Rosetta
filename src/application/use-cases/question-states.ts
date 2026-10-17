import type { OpenQuestionState } from '../../domain/cards/card-vocabulary.js';
import type { ProjectRef, RecordedQuestion } from '../ports/answers-file.js';
import type { PriorCards } from '../ports/prior-cards.js';
import { askingTheSame } from '../understand/answer-rerun.js';

// RF-1007, RF-241, data-model.md section 3.7: the state of a question is the state of its `OQ` card
// in the run that raised it. A question whose card is gone cannot be re-run, so it reads Open.

/** A question of a run with its state. */
export interface StatedQuestion extends RecordedQuestion {
  readonly state: OpenQuestionState;
}

// RF-1007
export async function withStates(
  cards: PriorCards,
  project: ProjectRef,
  runKey: string,
  questions: readonly RecordedQuestion[],
): Promise<readonly StatedQuestion[]> {
  const earlier = await cards.cardsOf(project, runKey);
  return questions.map((question) => {
    const card = earlier.find((each) => each.id === question.cardId && each.type === 'OQ');
    // A merged question has a card per area: it is Answered when every one of them is.
    const behind = card === undefined ? [] : askingTheSame(card, earlier);
    const answered = behind.length > 0 && behind.every((each) => each.questionState === 'Answered');
    return { ...question, state: answered ? 'Answered' : 'Open' };
  });
}
