// RF-240, DEC-98, data-model.md section 3.16: the project's `answers.md`, one section per open
// question. A run adds the open questions it found; a question already in the file keeps its
// section and its answer, so an answer is never overwritten.

export interface OpenQuestion {
  /** `OQ-003`, numbered in its run. */
  readonly cardId: string;
  /** The folder name of the run that found it. */
  readonly runKey: string;
  readonly question: string;
  /** One line: the first citation and claim of the card. */
  readonly context: string;
}

export interface AnswersFile {
  /** Adds the questions not yet in the project's file; rejects with the writer's code. */
  addQuestions(
    project: { readonly userId: string; readonly projectId: string },
    questions: readonly OpenQuestion[],
  ): Promise<void>;
}
