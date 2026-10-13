import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  ApplicationLogReader,
  LogQuery,
  StoredLogEntry,
} from '../../application/ports/application-log-reader.js';
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

export class FileApplicationLogReader implements ApplicationLogReader {
  private readonly options: FileApplicationLogReaderOptions;

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

  private async readFile(name: string, mentioning: readonly string[]): Promise<StoredLogEntry[]> {
    let handle;
    try {
      handle = await open(join(this.options.dataDir, 'logs', name), 'r');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return [];
      throw error;
    }
    const entries: StoredLogEntry[] = [];
    try {
      for await (const line of handle.readLines()) {
        if (!mentioning.some((text) => line.includes(text))) continue;
        const entry = this.parse(line);
        if (entry !== undefined) entries.push(entry);
      }
    } finally {
      await handle.close();
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
