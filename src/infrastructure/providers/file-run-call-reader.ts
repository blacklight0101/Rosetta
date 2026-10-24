import type {
  FileStatReader,
  OutputWriter,
  WorkspaceFile,
} from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type {
  RunCallLog,
  RunCallReader,
  StoredCall,
  StoredTranscriptEntry,
} from '../../application/ports/run-call-reader.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { summarizeCalls, type ProviderRoleSummary } from '../../domain/observability/call-stats.js';
import { runPath } from '../files/workspace-paths.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { parseCallLine, parseTranscriptLine } from './call-record-schema.js';

// RF-1011, RF-408, RNF-003, P5-22: reads `provider-calls.jsonl` and `transcripts/<agentTaskId>.jsonl` of a
// run folder through the OutputWriter, so only the owner's workspace is reachable. Every line is
// parsed as unknown, masked again and checked against its schema; a torn last line and a line that
// is not a record are left out.
// A file is parsed once and kept (a few runs' call logs, a few dozen transcripts, least recently
// read out first). Each read asks the file system for the size and modification time: unchanged
// means the kept answer, a file that grew (a run still writing) is read again but only the lines
// after the ones already parsed are parsed, and a file that is gone, or smaller, is forgotten.
// Keys hold the user, so one user's kept file is never given for another's scope.

export interface FileRunCallReaderOptions {
  readonly reader: Pick<OutputWriter, 'readText'> & FileStatReader;
  readonly masker: TextMasker;
  /** How many runs' call logs are kept. */
  readonly runsKept?: number;
}

// The agent task id becomes a file name (provider-call-lines.ts): only a plain name is read.
const PLAIN_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DEFAULT_RUNS_KEPT = 8;
const TRANSCRIPTS_PER_RUN = 8;

function parsedLines(text: string): unknown[] {
  return text.split('\n').flatMap((line) => {
    if (line === '') return [];
    try {
      const value: unknown = JSON.parse(line);
      return [value];
    } catch {
      return [];
    }
  });
}

/** The index right after the last line break of the text; 0 when it holds none. */
function completeEnd(text: string): number {
  return text.lastIndexOf('\n') + 1;
}

const bySeq = (left: StoredCall, right: StoredCall): number => left.seq - right.seq;

/** The call log as parsed at one version of the file. */
class CallLogSnapshot implements RunCallLog {
  readonly calls: readonly StoredCall[];
  #summary: readonly ProviderRoleSummary[] | undefined;
  #bySeq: ReadonlyMap<number, StoredCall> | undefined;

  constructor(calls: readonly StoredCall[]) {
    const ordered = calls.every(
      (call, index) => index === 0 || (calls[index - 1]?.seq ?? 0) <= call.seq,
    );
    this.calls = ordered ? calls : [...calls].sort(bySeq);
  }

  get summary(): readonly ProviderRoleSummary[] {
    this.#summary ??= summarizeCalls(this.calls);
    return this.#summary;
  }

  find(seq: number): StoredCall | undefined {
    this.#bySeq ??= new Map([...this.calls].reverse().map((call) => [call.seq, call]));
    return this.#bySeq.get(seq);
  }

  page(after: number, limit: number): readonly StoredCall[] {
    let low = 0;
    let high = this.calls.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((this.calls[middle]?.seq ?? 0) > after) high = middle;
      else low = middle + 1;
    }
    return this.calls.slice(low, low + limit);
  }
}

const NO_CALLS = new CallLogSnapshot([]);

/** What is kept of a file: the version it was read at, how far it was parsed, and the result. */
interface Kept<T> {
  readonly size: number;
  readonly modifiedMs: number;
  /** Characters of the text that are parsed (up to the last line break). */
  readonly consumed: number;
  readonly value: T;
}

/** The least recently used entries first; reading an entry moves it to the end. */
class Recent<T> {
  readonly #entries = new Map<string, T>();
  readonly #most: number;

  constructor(most: number) {
    this.#most = Math.max(1, most);
  }

  get(key: string): T | undefined {
    const found = this.#entries.get(key);
    if (found === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, found);
    return found;
  }

  set(key: string, value: T): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.#most) break;
      this.#entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }
}

export class FileRunCallReader implements RunCallReader {
  private readonly options: FileRunCallReaderOptions;
  private readonly logs: Recent<Kept<CallLogSnapshot>>;
  private readonly transcripts: Recent<Kept<readonly StoredTranscriptEntry[]>>;
  /** One refresh of a file at a time, so two requests do not parse it twice. */
  private readonly busy = new Map<string, Promise<unknown>>();

  constructor(options: FileRunCallReaderOptions) {
    this.options = options;
    const runs = options.runsKept ?? DEFAULT_RUNS_KEPT;
    this.logs = new Recent(runs);
    this.transcripts = new Recent(runs * TRANSCRIPTS_PER_RUN);
  }

  // RF-1011
  async log(scope: RunScope): Promise<RunCallLog> {
    const name = 'provider-calls.jsonl';
    return this.serial(this.keyOf(scope, name), async () => {
      const kept = await this.refresh(scope, name, this.logs, {
        empty: NO_CALLS,
        extend: (before, text) =>
          new CallLogSnapshot([
            ...before.calls,
            ...parsedLines(text).flatMap((value) => {
              const call = parseCallLine(maskDeep(value, this.options.masker));
              return call === undefined ? [] : [call];
            }),
          ]),
      });
      return kept;
    });
  }

  // RF-1011
  async transcript(
    scope: RunScope,
    agentTaskId: string,
  ): Promise<readonly StoredTranscriptEntry[]> {
    if (!PLAIN_TASK_ID.test(agentTaskId) || agentTaskId.includes('..')) return [];
    const name = `transcripts/${agentTaskId}.jsonl`;
    return this.serial(this.keyOf(scope, name), () =>
      this.refresh(scope, name, this.transcripts, {
        empty: [],
        extend: (before, text) => [
          ...before,
          ...parsedLines(text).flatMap((value) => {
            const entry = parseTranscriptLine(maskDeep(value, this.options.masker));
            return entry === undefined ? [] : [entry];
          }),
        ],
      }),
    );
  }

  private keyOf(scope: RunScope, name: string): string {
    return [scope.userId, scope.projectId, scope.runKey, name].join('|');
  }

  private async serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const run = (this.busy.get(key) ?? Promise.resolve()).then(work, work);
    const tail = run.catch(() => undefined);
    this.busy.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.busy.get(key) === tail) this.busy.delete(key);
    }
  }

  /** The kept parse of the file brought up to its present version. */
  private async refresh<T>(
    scope: RunScope,
    name: string,
    kept: Recent<Kept<T>>,
    parse: { readonly empty: T; readonly extend: (before: T, newLines: string) => T },
  ): Promise<T> {
    const key = this.keyOf(scope, name);
    const file = this.fileOf(scope, name);
    const facts = await this.options.reader.statFile(file);
    if (!facts.ok) {
      kept.delete(key);
      if (facts.error.reason === 'not-found') return parse.empty;
      throw new RosettaError(facts.error.code, facts.error.message);
    }
    const before = kept.get(key);
    const { size, modifiedMs } = facts.value;
    if (before?.size === size && before.modifiedMs === modifiedMs) return before.value;
    const text = await this.read(file);
    const grown = before !== undefined && size > before.size && text.length >= before.consumed;
    const from = grown ? before.consumed : 0;
    const end = completeEnd(text.slice(from)) + from;
    const value = parse.extend(grown ? before.value : parse.empty, text.slice(from, end));
    kept.set(key, { size, modifiedMs, consumed: end, value });
    return value;
  }

  private fileOf(scope: RunScope, name: string): WorkspaceFile {
    return {
      userId: scope.userId,
      path: `${runPath(scope.projectId, scope.runKey)}/${name}`,
    };
  }

  /** The text of a file of the run folder; empty when the run has not written it. */
  private async read(file: WorkspaceFile): Promise<string> {
    const read = await this.options.reader.readText(file);
    if (read.ok) return read.value;
    if (read.error.reason === 'not-found') return '';
    throw new RosettaError(read.error.code, read.error.message);
  }
}
