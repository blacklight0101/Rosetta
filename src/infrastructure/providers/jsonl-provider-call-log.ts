import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  ProviderCallRecord,
  ProviderCallRecorder,
  TranscriptEntry,
} from '../../application/ports/provider-call-recorder.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  callLine,
  transcriptFileName,
  transcriptLine,
  transcriptRef,
} from './provider-call-lines.js';

export interface JsonlProviderCallLogOptions {
  /** The run folder: `<data>/users/<userId>/projects/<projectId>/runs/<runId>`. */
  readonly runDir: string;
  readonly masker: TextMasker;
}

interface FileTail {
  /** The lines the file holds, a partial last line included. */
  readonly lines: number;
  /** True when the file ends without a newline (a crash mid-append). */
  readonly torn: boolean;
}

/** RF-006: the lines a file already holds, so a resumed run continues its `seq` without a repeat. */
async function existingTail(file: string): Promise<FileTail> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { lines: 0, torn: false };
    }
    throw new RosettaError(ERROR_CODES.providerCallLogFailed, undefined, { cause: error });
  }
  const torn = text !== '' && !text.endsWith('\n');
  return { lines: text.split('\n').length - (torn ? 0 : 1), torn };
}

async function appendTo(file: string, text: string): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, text, 'utf8');
  } catch (error) {
    throw new RosettaError(ERROR_CODES.providerCallLogFailed, undefined, { cause: error });
  }
}

// RF-408, DEC-50: appends masked lines to `provider-calls.jsonl` and to
// `transcripts/<agentTaskId>.jsonl` in the run folder (data-model.md 3.10, 3.15). Writes run one
// after another, so `seq` follows the order of the lines even when agent tasks run in parallel.
export class JsonlProviderCallLog implements ProviderCallRecorder {
  private readonly options: JsonlProviderCallLogOptions;
  private readonly lineCounts = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: JsonlProviderCallLogOptions) {
    this.options = options;
  }

  record(call: ProviderCallRecord): Promise<void> {
    const file = join(this.options.runDir, 'provider-calls.jsonl');
    return this.serial(async () => {
      await this.append(file, (first) => [callLine(call, first, this.options.masker)]);
    });
  }

  transcript(agentTaskId: string, entries: readonly TranscriptEntry[]): Promise<string> {
    return this.serial(async () => {
      const name = transcriptFileName(agentTaskId);
      const file = join(this.options.runDir, 'transcripts', name);
      const first = await this.append(file, (start) =>
        entries.map((entry, index) => transcriptLine(entry, start + index, this.options.masker)),
      );
      return transcriptRef(agentTaskId, first);
    });
  }

  /** Masks the lines numbered from the next free `seq`, appends them and returns that `seq`. */
  private async append(file: string, lines: (first: number) => string[]): Promise<number> {
    const known = this.lineCounts.get(file);
    const tail = known === undefined ? await existingTail(file) : { lines: known, torn: false };
    const first = tail.lines + 1;
    const text = lines(first);
    // A torn last line stays as it was; the next record starts on a line of its own.
    await appendTo(file, (tail.torn ? '\n' : '') + text.join(''));
    this.lineCounts.set(file, first - 1 + text.length);
    return first;
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
