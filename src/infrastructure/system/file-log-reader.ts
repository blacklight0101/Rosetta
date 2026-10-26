import { open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  ApplicationLogReader,
  LogQuery,
  StoredLogEntry,
} from '../../application/ports/application-log-reader.js';
import { Recent } from '../files/recent.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-1011, RF-009, RNF-003, data-model.md section 3.14: reads the daily files
// `<data>/logs/rosetta-YYYY-MM-DD.jsonl`, one UTC day each. A line is parsed only when it holds one
// of the texts asked for, as unknown; it is masked again and checked against the entry schema, and
// a torn line and a line that is not an entry are left out.

export interface FileApplicationLogReaderOptions {
  /** `ROSETTA_DATA_DIR`; the files are in `<dataDir>/logs/`. */
  readonly dataDir: string;
  readonly masker: TextMasker;
  /** How many bytes of a file are read at a time; 1 MiB by default. */
  readonly chunkBytes?: number;
}

const DAY_MS = 86_400_000;
/** A run never spans more days than the log is kept for; a longer span is cut off here. */
const MAX_DAYS = 31;

const entrySchema = z.object({
  at: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  logger: z.string(),
  message: z.string(),
  code: z.string().optional(),
  runId: z.string().optional(),
  userId: z.string().optional(),
  agentTaskId: z.string().optional(),
  callId: z.string().optional(),
});

function toEntry(value: unknown): StoredLogEntry | undefined {
  const parsed = entrySchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { code, runId, userId, agentTaskId, callId, ...required } = parsed.data;
  return {
    ...required,
    ...(code === undefined ? {} : { code }),
    ...(runId === undefined ? {} : { runId }),
    ...(userId === undefined ? {} : { userId }),
    ...(agentTaskId === undefined ? {} : { agentTaskId }),
    ...(callId === undefined ? {} : { callId }),
  };
}

/** The names of the files of the UTC days from `fromMs` to `toMs`, oldest day first. */
function fileNames(fromMs: number, toMs: number): string[] {
  const first = Math.floor(fromMs / DAY_MS) * DAY_MS;
  const last = Math.max(first, Math.floor(toMs / DAY_MS) * DAY_MS);
  const days = Math.min(MAX_DAYS, (last - first) / DAY_MS + 1);
  return Array.from(
    { length: days },
    (_item, index) =>
      `rosetta-${new Date(first + index * DAY_MS).toISOString().slice(0, 10)}.jsonl`,
  );
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** What is kept of one day's file for one run: its version, how far it is parsed, and the entries. */
interface KeptDay {
  readonly size: number;
  readonly modifiedMs: number;
  /** Bytes parsed: up to and including the last line break read. */
  readonly consumed: number;
  /** The last bytes before `consumed`: a rewritten file that grew no longer matches them. */
  readonly tail: Buffer;
  /** The entries of the complete lines. */
  readonly entries: readonly StoredLogEntry[];
  /** The same with the entry of a last line that has no line break yet, when it parses. */
  readonly listed: readonly StoredLogEntry[];
}

const DAYS_KEPT = 64;
const LINE_BREAK = 0x0a;
const DEFAULT_CHUNK_BYTES = 1_048_576;
/** How many bytes before the parsed end are compared to know the file was only added to. */
const PREFIX_CHECK_BYTES = 64;
/** A line longer than this is not an entry; it is skipped, so memory stays bounded. */
const LONGEST_LINE_BYTES = 4_194_304;

/** What one pass over the bytes of a file found. */
interface Pass {
  entries: StoredLogEntry[];
  consumed: number;
  tail: Buffer;
  /** The bytes after the last line break read. */
  partial: Buffer;
  /** Inside a line longer than the limit: its bytes are dropped up to the next line break. */
  skipping: boolean;
}

export class FileApplicationLogReader implements ApplicationLogReader {
  private readonly options: FileApplicationLogReaderOptions;
  private readonly kept = new Recent<KeptDay>(DAYS_KEPT);

  constructor(options: FileApplicationLogReaderOptions) {
    this.options = options;
  }

  // RF-1011
  async read(query: LogQuery): Promise<readonly StoredLogEntry[]> {
    const entries: StoredLogEntry[] = [];
    for (const name of fileNames(query.fromMs, query.toMs)) {
      entries.push(...(await this.readFile(name, query.mentioning)));
    }
    return entries;
  }

  // P5-28: a file is parsed once for a run and kept; the size and modification time are asked on
  // every read. A file that grew is read from where the parse stopped, provided the bytes just
  // before that point are still the ones read (a rewritten file that is now longer is parsed again
  // from the start); a file that shrank is parsed again; a file that is gone is forgotten. The
  // file is read in chunks, so a log of any size is read in bounded memory.
  private async readFile(
    name: string,
    mentioning: readonly string[],
  ): Promise<readonly StoredLogEntry[]> {
    const key = [name, ...mentioning].join('|');
    let handle;
    try {
      handle = await open(join(this.options.dataDir, 'logs', name), 'r');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        this.kept.delete(key);
        return [];
      }
      throw error;
    }
    try {
      return await this.refresh(handle, key, mentioning);
    } finally {
      await handle.close();
    }
  }

  private async refresh(
    handle: FileHandle,
    key: string,
    mentioning: readonly string[],
  ): Promise<readonly StoredLogEntry[]> {
    const { size, mtimeMs: modifiedMs } = await handle.stat();
    const before = this.kept.get(key);
    if (before?.size === size && before.modifiedMs === modifiedMs) return before.listed;
    const grown =
      before !== undefined && size > before.size && (await this.sameBefore(handle, before));
    const pass = await this.parsePass(handle, size, mentioning, grown ? before : undefined);
    const entries = [...(grown ? before.entries : []), ...pass.entries];
    const tail = this.parseLines(pass.partial.toString('utf8'), mentioning);
    const listed = tail.length === 0 ? entries : [...entries, ...tail];
    const { consumed, tail: last } = pass;
    this.kept.set(key, { size, modifiedMs, consumed, tail: last, entries, listed });
    return listed;
  }

  /** Whether the bytes just before the parsed end of the kept parse are still the ones it read. */
  private async sameBefore(handle: FileHandle, before: KeptDay): Promise<boolean> {
    if (before.tail.length === 0) return before.consumed === 0;
    const at = Buffer.alloc(before.tail.length);
    const { bytesRead } = await handle.read(at, 0, at.length, before.consumed - at.length);
    return bytesRead === at.length && at.equals(before.tail);
  }

  private async parsePass(
    handle: FileHandle,
    size: number,
    mentioning: readonly string[],
    resume: KeptDay | undefined,
  ): Promise<Pass> {
    const chunkBytes = Math.max(1, this.options.chunkBytes ?? DEFAULT_CHUNK_BYTES);
    const pass: Pass = {
      entries: [],
      consumed: resume?.consumed ?? 0,
      tail: resume?.tail ?? Buffer.alloc(0),
      partial: Buffer.alloc(0),
      skipping: false,
    };
    let position = pass.consumed;
    while (position < size) {
      const chunk = Buffer.alloc(Math.min(chunkBytes, size - position));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      this.takeChunk(pass, chunk.subarray(0, bytesRead), position, mentioning);
    }
    return pass;
  }

  /** Takes the next bytes of the file, which end at `position`, into the pass. */
  private takeChunk(pass: Pass, chunk: Buffer, position: number, mentioning: readonly string[]) {
    let bytes = Buffer.concat([pass.partial, chunk]);
    if (pass.skipping) {
      const end = bytes.indexOf(LINE_BREAK);
      pass.consumed += end < 0 ? bytes.length : end + 1;
      bytes = end < 0 ? Buffer.alloc(0) : bytes.subarray(end + 1);
      pass.skipping = end < 0;
    }
    this.takeLines(pass, bytes, mentioning);
    if (pass.partial.length > LONGEST_LINE_BYTES) {
      pass.partial = Buffer.alloc(0);
      pass.consumed = position;
      pass.skipping = true;
    }
  }

  /** Parses the complete lines of the bytes into the pass; the rest becomes its partial line. */
  private takeLines(pass: Pass, bytes: Buffer, mentioning: readonly string[]): void {
    const complete = bytes.lastIndexOf(LINE_BREAK) + 1;
    const lines = bytes.subarray(0, complete);
    pass.entries.push(...this.parseLines(lines.toString('utf8'), mentioning));
    pass.tail = Buffer.concat([pass.tail, lines]).subarray(-PREFIX_CHECK_BYTES);
    pass.consumed += complete;
    pass.partial = bytes.subarray(complete);
  }

  private parseLines(text: string, mentioning: readonly string[]): StoredLogEntry[] {
    const entries: StoredLogEntry[] = [];
    for (const line of text.split('\n')) {
      if (line === '' || !mentioning.some((each) => line.includes(each))) continue;
      const entry = this.parse(line);
      if (entry !== undefined) entries.push(entry);
    }
    return entries;
  }

  private parse(line: string): StoredLogEntry | undefined {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return undefined;
    }
    return toEntry(maskDeep(value, this.options.masker));
  }
}
