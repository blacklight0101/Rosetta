import type { OpenQuestionState } from '../../domain/cards/card-vocabulary.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import type { ProjectRef } from './answers-file.js';

// RF-241, data-model.md section 3.7: the cards an earlier understand run of the project wrote, read
// back from its card files, and the one change a later run makes to them: an open question that was
// answered and re-run is marked `Answered`.

/** What a re-run compares with and needs from an earlier card. */
export interface PriorCard {
  readonly id: string;
  readonly type: CardType;
  readonly title: string;
  readonly area: string;
  /** The text of every claim. */
  readonly claims: readonly string[];
  /** RF-1017: the repository files the claims cite, each once; none when the adapter did not read them. */
  readonly cited?: readonly string[];
  /** `OQ` cards only. */
  readonly questionState?: OpenQuestionState;
  /** `OQ` cards only: the question asked. */
  readonly question?: string;
}

export interface PriorCards {
  /** The cards of the run with that folder name; none when the run or its cards are gone. */
  cardsOf(project: ProjectRef, runKey: string): Promise<readonly PriorCard[]>;
  /** Marks these `OQ` cards of the run `Answered`; the ids of those it marked. */
  markAnswered(
    project: ProjectRef,
    runKey: string,
    cardIds: readonly string[],
  ): Promise<readonly string[]>;
}

/** RF-241: the way back for a question that was marked `Answered` and whose answer has changed. */
export interface QuestionReopener {
  /** Marks these `OQ` cards of the run `Open` again; the ids of those it changed. */
  reopen(
    project: ProjectRef,
    runKey: string,
    cardIds: readonly string[],
  ): Promise<readonly string[]>;
}
