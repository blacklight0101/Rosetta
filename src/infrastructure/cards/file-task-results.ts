import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { TaskResult, TaskResults } from '../../application/ports/task-results.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath } from '../files/workspace-paths.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { parseTaskResults, taskResultsFile } from './task-results-schema.js';

// RF-006, RF-141, RNF-002, data-model.md section 3.7a: `task-results.json` in the run folder, what
// each ended reader task left, through the OutputWriter (inside the owner's workspace, replaced
// atomically) and masked like every file Rosetta writes. A file that cannot be read as results is
// an error (RST-1309), never guessed: a resume would otherwise trust cards it cannot see.

export interface FileTaskResultsOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

function fileOf(scope: RunScope): WorkspaceFile {
  return {
    userId: scope.userId,
    path: `${runPath(scope.projectId, scope.runKey)}/task-results.json`,
  };
}

function unreadable(detail: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.taskResultsUnreadable,
    `The task results of a run could not be read: ${detail}.`,
    cause === undefined ? undefined : { cause },
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw unreadable('the file is not JSON', error);
  }
}

export class FileTaskResults implements TaskResults {
  private readonly options: FileTaskResultsOptions;

  constructor(options: FileTaskResultsOptions) {
    this.options = options;
  }

  // RF-006
  async read(scope: RunScope): Promise<readonly TaskResult[]> {
    const read = await this.options.writer.readText(fileOf(scope));
    if (!read.ok) {
      if (read.error.reason === 'not-found') return [];
      throw unreadable(read.error.message);
    }
    const results = parseTaskResults(parseJson(read.value));
    if (results === undefined) throw unreadable('the file is not a version 1 results file');
    return results;
  }

  // RF-006, RF-141
  async write(scope: RunScope, results: readonly TaskResult[]): Promise<void> {
    const masked = maskDeep(taskResultsFile(results), this.options.masker);
    const text = `${JSON.stringify(masked, null, 2)}\n`;
    const written = await this.options.writer.writeText(fileOf(scope), text);
    if (!written.ok) throw new RosettaError(written.error.code, written.error.message);
  }
}
