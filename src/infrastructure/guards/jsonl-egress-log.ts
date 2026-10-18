import type { EgressLog, EgressRecord } from '../../application/ports/egress-log.js';
import type {
  OutputWriter,
  WorkspaceFile,
  WriteRefusal,
} from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath } from '../files/workspace-paths.js';
import { maskDeep } from './mask-deep.js';
import type { TextMasker } from './secret-masker.js';

// RF-142, RNF-003, data-model.md section 3.11: appends one masked line per call to
// `egress.log.jsonl` in the run folder, through the OutputWriter (so the write stays inside the
// owner's workspace). Appends run one after another, so `seq` has no gaps even when agent tasks
// call in parallel. A crash can leave a torn last line: the first append of the process counts
// the complete lines, removes the fragment and numbers on from there (RF-006). A masker failure is
// thrown (RST-2101) and nothing is written. A call that belongs to a project and to no run logs to a
// folder of the project instead (`folder`).

/** Where the log lives: the folder of a run, or a folder of the owner's workspace given as is. */
export type EgressLogPlace =
  { readonly scope: RunScope } | { readonly userId: string; readonly folder: string };

export type JsonlEgressLogOptions = EgressLogPlace & {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
};

const schemaVersion = 1;

function failed(detail: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.egressLogFailed,
    `The egress log of a run could not be stored: ${detail}.`,
    cause === undefined ? undefined : { cause },
  );
}

/**
 * One masked line. The counts are numbers under the masker's own kind names, so they are added
 * after masking: masked with their keys, `"password": 0` would read as a password setting.
 */
function lineOf(record: EgressRecord, seq: number, masker: TextMasker): string {
  const { maskedCounts, ...sent } = record;
  const masked = maskDeep({ schemaVersion, seq, ...sent }, masker);
  if (masked === null || typeof masked !== 'object') throw failed('the line could not be masked');
  return JSON.stringify({ ...masked, maskedCounts });
}

export class JsonlEgressLog implements EgressLog {
  private readonly options: JsonlEgressLogOptions;
  private readonly file: WorkspaceFile;
  private lastSeq: number | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: JsonlEgressLogOptions) {
    this.options = options;
    this.file =
      'scope' in options
        ? {
            userId: options.scope.userId,
            path: `${runPath(options.scope.projectId, options.scope.runKey)}/egress.log.jsonl`,
          }
        : { userId: options.userId, path: `${options.folder}/egress.log.jsonl` };
  }

  // RF-142
  append(record: EgressRecord): Promise<void> {
    const result = this.tail.then(async () => {
      const seq = (await this.storedSeq()) + 1;
      const text = lineOf(record, seq, this.options.masker);
      await this.write(() => this.options.writer.appendLine(this.file, text));
      this.lastSeq = seq;
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** The `seq` of the last complete line, read once; a torn last line is removed first. */
  private async storedSeq(): Promise<number> {
    if (this.lastSeq !== undefined) return this.lastSeq;
    const { writer } = this.options;
    let read: Result<string, WriteRefusal>;
    try {
      read = await writer.readText(this.file);
    } catch (error) {
      throw failed('the file could not be read', error);
    }
    if (!read.ok) {
      if (read.error.reason === 'not-found') return 0;
      throw failed(read.error.message);
    }
    const complete = read.value.slice(0, read.value.lastIndexOf('\n') + 1);
    if (complete !== read.value) await this.write(() => writer.writeText(this.file, complete));
    return complete.split('\n').length - 1;
  }

  /** Runs one write; a refusal or a disk error is RST-2107. */
  private async write(step: () => Promise<Result<void, WriteRefusal>>): Promise<void> {
    let written: Result<void, WriteRefusal>;
    try {
      written = await step();
    } catch (error) {
      throw failed('the file could not be written', error);
    }
    if (!written.ok) throw failed(written.error.message);
  }
}
