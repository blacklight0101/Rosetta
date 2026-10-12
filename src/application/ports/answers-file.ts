import type { Result } from '../../domain/errors/result.js';

// RF-240, RF-1007, DEC-98, data-model.md section 3.16: the project's `answers.md`, one section per
// open question. A run adds the open questions it found; a question already in the file keeps its
// section and its answer, so an answer is never overwritten by a run. The page records the answers
// to the questions of one run; the other sections stay as they are.

export interface OpenQuestion {
  /** `OQ-003`, numbered in its run. */
  readonly cardId: string;
  /** The folder name of the run that found it. */
  readonly runKey: string;
  readonly question: string;
  /** One line: the first citation and claim of the card. */
  readonly context: string;
}

/** A question of one run as the file holds it; `answer` is empty while it has none. */
export interface RecordedQuestion {
  readonly cardId: string;
  readonly question: string;
  readonly context: string;
  readonly answer: string;
}

/** The answer the user gave to one question of the run. */
export interface AnswerEntry {
  readonly cardId: string;
  readonly answer: string;
}

export interface ProjectRef {
  readonly userId: string;
  readonly projectId: string;
}

export interface AnswersFile {
  /** Adds the questions not yet in the project's file; rejects with the writer's code. */
  addQuestions(project: ProjectRef, questions: readonly OpenQuestion[]): Promise<void>;
  /** RF-1007: the questions the run with that folder name added, in file order. */
  questionsOf(project: ProjectRef, runKey: string): Promise<readonly RecordedQuestion[]>;
  /**
   * RF-1007: writes the answers into the sections of the run's questions and keeps every other
   * line; a card id the run has no question for writes nothing and answers `unknown-question`.
   * Answers the run's questions as they are after the write.
   */
  recordAnswers(
    project: ProjectRef,
    runKey: string,
    answers: readonly AnswerEntry[],
  ): Promise<Result<readonly RecordedQuestion[], 'unknown-question'>>;
}
