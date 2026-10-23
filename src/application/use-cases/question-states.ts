import type { OpenQuestionState } from '../../domain/cards/card-vocabulary.js';
import type { ProjectRef, RecordedQuestion } from '../ports/answers-file.js';
import type { PriorCard, PriorCards } from '../ports/prior-cards.js';
import { askingTheSame } from '../understand/answer-rerun.js';
import { consolidatedQuestions } from '../understand/consolidated-questions.js';

// RF-1007, RF-241, data-model.md section 3.7: the state of a question is the state of its `OQ` card
// in the run that raised it. A question whose card is gone cannot be re-run, so it reads Open.

/** A question of a run with its state. */
export interface StatedQuestion extends RecordedQuestion {
  readonly state: OpenQuestionState;
  /** RF-1017: how many cards other than open questions depend on the question. */
  readonly dependents: number;
}

/** RF-1017, RF-243: the cards that are not open questions and cite a file the question's cards cite. */
function dependentsOf(behind: readonly PriorCard[], earlier: readonly PriorCard[]): number {
  const files = new Set(behind.flatMap((card) => card.cited ?? []));
  if (files.size === 0) return 0;
  return earlier.filter(
    (card) => card.type !== 'OQ' && (card.cited ?? []).some((file) => files.has(file)),
  ).length;
}

/**
 * RF-615, DEC-154: a question waits for the user while it is `Open` and has no saved answer. An
 * answer of blanks only is none. A question with a saved answer is not open for the journey, but it
 * is `Answered` only when a later run has read the answer (RF-243).
 */
export const waitsForAnswer = (question: Pick<StatedQuestion, 'state' | 'answer'>): boolean =>
  question.state === 'Open' && question.answer.trim() === '';

// P5-11, RF-1007, RF-243: the questions of the consolidated card set (a merged-away id is not one) with
// their states. Every reader of a run's questions that shows or counts them goes through this.
export async function consolidatedStates(
  cards: Pick<PriorCards, 'cardsOf'>,
  project: ProjectRef,
  runKey: string,
  filed: readonly RecordedQuestion[],
): Promise<readonly StatedQuestion[]> {
  const earlier = await cards.cardsOf(project, runKey);
  return consolidatedQuestions(filed, earlier).map((question) => {
    const card = earlier.find((each) => each.id === question.cardId && each.type === 'OQ');
    // A merged question has a card per area: it is Answered when every one of them is.
    const behind = card === undefined ? [] : askingTheSame(card, earlier);
    const answered = behind.length > 0 && behind.every((each) => each.questionState === 'Answered');
    return {
      ...question,
      state: answered ? 'Answered' : 'Open',
      dependents: dependentsOf(behind, earlier),
    };
  });
}
