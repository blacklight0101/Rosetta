import type { AnswersFile, OpenQuestion } from '../../application/ports/answers-file.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-240, DEC-98, data-model.md section 3.16: the project's `answers.md`.

export interface FileAnswersFileOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

export class FileAnswersFile implements AnswersFile {
  private readonly options: FileAnswersFileOptions;

  constructor(options: FileAnswersFileOptions) {
    this.options = options;
  }

  addQuestions(
    _project: { readonly userId: string; readonly projectId: string },
    _questions: readonly OpenQuestion[],
  ): Promise<void> {
    return Promise.resolve();
  }
}
