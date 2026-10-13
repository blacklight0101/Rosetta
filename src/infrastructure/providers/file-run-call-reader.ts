import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type {
  RunCallReader,
  StoredCall,
  StoredTranscriptEntry,
} from '../../application/ports/run-call-reader.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath } from '../files/workspace-paths.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { parseCallLine, parseTranscriptLine } from './call-record-schema.js';

// RF-1011, RF-408, RNF-003: reads `provider-calls.jsonl` and `transcripts/<agentTaskId>.jsonl` of a
// run folder through the OutputWriter, so only the owner's workspace is reachable. Every line is
// parsed as unknown, masked again and checked against its schema; a torn last line and a line that
// is not a record are left out.

export interface FileRunCallReaderOptions {
  readonly reader: Pick<OutputWriter, 'readText'>;
  readonly masker: TextMasker;
}

// The agent task id becomes a file name (provider-call-lines.ts): only a plain name is read.
const PLAIN_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function parsedLines(text: string): unknown[] {
  const lines = text.split('\n');
  // The last element is what follows the final line break: empty, or a line a crash cut short.
  lines.pop();
  return lines.flatMap((line) => {
    if (line === '') return [];
    try {
      const value: unknown = JSON.parse(line);
      return [value];
    } catch {
      return [];
    }
  });
}

export class FileRunCallReader implements RunCallReader {
  private readonly options: FileRunCallReaderOptions;

  constructor(options: FileRunCallReaderOptions) {
    this.options = options;
  }

  // RF-1011
  async calls(scope: RunScope): Promise<readonly StoredCall[]> {
    const text = await this.read(scope, 'provider-calls.jsonl');
    return parsedLines(text).flatMap((value) => {
      const call = parseCallLine(maskDeep(value, this.options.masker));
      return call === undefined ? [] : [call];
    });
  }

  // RF-1011
  async transcript(
    scope: RunScope,
    agentTaskId: string,
  ): Promise<readonly StoredTranscriptEntry[]> {
    if (!PLAIN_TASK_ID.test(agentTaskId) || agentTaskId.includes('..')) return [];
    const text = await this.read(scope, `transcripts/${agentTaskId}.jsonl`);
    return parsedLines(text).flatMap((value) => {
      const entry = parseTranscriptLine(maskDeep(value, this.options.masker));
      return entry === undefined ? [] : [entry];
    });
  }

  /** The text of a file of the run folder; empty when the run has not written it. */
  private async read(scope: RunScope, name: string): Promise<string> {
    const file: WorkspaceFile = {
      userId: scope.userId,
      path: `${runPath(scope.projectId, scope.runKey)}/${name}`,
    };
    const read = await this.options.reader.readText(file);
    if (read.ok) return read.value;
    if (read.error.reason === 'not-found') return '';
    throw new RosettaError(read.error.code, read.error.message);
  }
}
