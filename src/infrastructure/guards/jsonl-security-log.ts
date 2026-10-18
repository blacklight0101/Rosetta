import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { Clock } from '../../application/ports/clock.js';
import type { RunSecurityRecorder } from '../../application/runs/run-security-record.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-141: what the guards masked or blocked in the calls of a project that belong to no run, kept as
// one line each in `security.log.jsonl` of the project's folder, where a run keeps the same counts in
// its manifest. A line holds a time and numbers under the masker's kind names, no text of the call.

export interface JsonlSecurityLogOptions {
  readonly writer: OutputWriter;
  readonly clock: Clock;
  readonly userId: string;
  /** The workspace-relative folder that holds the file. */
  readonly folder: string;
}

const schemaVersion = 1;

export class JsonlSecurityLog implements RunSecurityRecorder {
  private readonly options: JsonlSecurityLogOptions;
  private readonly file: WorkspaceFile;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: JsonlSecurityLogOptions) {
    this.options = options;
    this.file = { userId: options.userId, path: `${options.folder}/security.log.jsonl` };
  }

  addMasking(counts: Readonly<Record<string, number>>): Promise<void> {
    return this.append({ kind: 'masking', counts });
  }

  addBlockedCall(): Promise<void> {
    return this.append({ kind: 'blocked' });
  }

  /** Lines are appended one after another, in the order of the calls. */
  private append(line: Readonly<Record<string, unknown>>): Promise<void> {
    const at = this.options.clock.now().toISOString();
    const text = JSON.stringify({ schemaVersion, at, ...line });
    const result = this.tail.then(async () => {
      const written = await this.options.writer.appendLine(this.file, text);
      if (!written.ok) {
        throw new RosettaError(
          ERROR_CODES.egressLogFailed,
          `The security log of a project could not be stored: ${written.error.message}.`,
        );
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
