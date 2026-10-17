/* eslint-disable @typescript-eslint/no-unused-vars -- stub until the feat commit */
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { TaskResult, TaskResults } from '../../application/ports/task-results.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-006, data-model.md section 3.7a: `task-results.json` in the run folder.

export interface FileTaskResultsOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

export class FileTaskResults implements TaskResults {
  private readonly options: FileTaskResultsOptions;

  constructor(options: FileTaskResultsOptions) {
    this.options = options;
  }

  read(scope: RunScope): Promise<readonly TaskResult[]> {
    return Promise.resolve([]);
  }

  write(scope: RunScope, results: readonly TaskResult[]): Promise<void> {
    return Promise.resolve();
  }
}
