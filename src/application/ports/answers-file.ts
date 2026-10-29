import type { Result } from '../../domain/errors/result.js';

// RF-240, RF-1007, DEC-98, data-model.md section 3.16: the project's `answers.md`, one section per
// open question. A run adds the open questions it found; a question already in the file keeps its
// section and its answer, so an answer is never overwritten by a run. The page records the answers
// to the questions of one run; the other sections stay as they are.

/** RF-645, DEC-178: one suggested answer of an `OQ` card, as `answers.md` holds it. */
export interface SuggestedOption {
  readonly answer: string;
  readonly description: string;
  readonly recommended: boolean;
}

export interface OpenQuestion {
  /** `OQ-003`, numbered in its run. */
  readonly cardId: string;
  /** The folder name of the run that found it. */
  readonly runKey: string;
  readonly question: string;
  /** One line: the first citation and claim of the card. */
  readonly context: string;
  /**
   * P5-11: the card survived a merge and the file has no section under its id. It gets a section even
   * when another section holds the same text, unless the run already has one under this id.
   */
  readonly survivor?: boolean;
  /** RF-645: the suggested answers of the card, the recommended one first; absent on an older card. */
  readonly options?: readonly SuggestedOption[] | undefined;
}

/** RF-646, DEC-179: an older answer to a question, kept in the history of its section. */
export interface AnswerRecord {
  /** The folder name of the run whose section held the answer. */
  readonly runKey: string;
  readonly answer: string;
}

/** RF-646: what a merge of duplicates keeps in the section that survives. */
export interface MergeEdit {
  readonly runKey: string;
  readonly cardId: string;
  /** Every run whose cards raised the question, oldest first (the `- Runs:` line). */
  readonly runs: readonly string[];
  /** The older answers that lost to a newer one (the `- History:` lines). */
  readonly history: readonly AnswerRecord[];
}

/** A question of one run as the file holds it; `answer` is empty while it has none. */
export interface RecordedQuestion {
  readonly cardId: string;
  readonly question: string;
  readonly context: string;
  readonly answer: string;
  /** RF-645: the suggested answers of a section written after DEC-178; absent on an older section. */
  readonly options?: readonly SuggestedOption[];
  /** RF-645: `''` while open, the number of the chosen option or `typed`; absent with no options. */
  readonly chosen?: string;
  /** RF-646: the runs whose cards raised the question, when the section names them. */
  readonly runs?: readonly string[];
  /** RF-646: the older answers kept by a merge of duplicates. */
  readonly history?: readonly AnswerRecord[];
}

/** The answer the user gave to one question of the run. */
export interface AnswerEntry {
  readonly cardId: string;
  readonly answer: string;
  /** RF-645: the number (from 1) of the suggested answer chosen, or `typed`; absent for a free answer. */
  readonly chosen?: number | 'typed' | undefined;
}

/** A question with an answer, for the re-run with answers (RF-241). */
export interface AnsweredQuestion extends RecordedQuestion {
  /** The folder name of the run that found it. */
  readonly runKey: string;
}

export interface ProjectRef {
  readonly userId: string;
  readonly projectId: string;
}

export interface AnswersFile {
  /**
   * Adds the questions not yet in the project's file (by their text; a `survivor` by its id in its run);
   * rejects with the writer's code.
   */
  addQuestions(project: ProjectRef, questions: readonly OpenQuestion[]): Promise<void>;
  /** RF-1007: the questions the run with that folder name added, in file order. */
  questionsOf(project: ProjectRef, runKey: string): Promise<readonly RecordedQuestion[]>;
  /** RF-241: the questions with an answer, of every run, in file order. */
  answeredQuestions(project: ProjectRef): Promise<readonly AnsweredQuestion[]>;
  /**
   * RF-1007: writes the answers into the sections of the run's questions and keeps every other
   * line; a card id the run has no question for writes nothing and answers `unknown-question`, and
   * an option number the question does not have answers `invalid-choice` (RF-645). A chosen option
   * writes its own answer text.
   * Answers the run's questions as they are after the write.
   */
  recordAnswers(
    project: ProjectRef,
    runKey: string,
    answers: readonly AnswerEntry[],
  ): Promise<Result<readonly RecordedQuestion[], 'unknown-question' | 'invalid-choice'>>;
  /**
   * RF-646, DEC-179: keeps in the named sections the runs that raised the question and the older
   * answers a merge of duplicates replaced. Idempotent: nothing is written when the lines are there;
   * a section the file does not hold is skipped; no section is deleted.
   */
  keepMerge(project: ProjectRef, edits: readonly MergeEdit[]): Promise<void>;
}
