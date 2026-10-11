import { appendFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Clock } from '../../application/ports/clock.js';
import type { Logger, LogRecord, SecurityEventDetail } from '../../application/ports/logger.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { formatLogEntry, securityRecord, toJsonLine } from './log-entry.js';

export interface JsonlFileLoggerOptions {
  /** `ROSETTA_DATA_DIR`; the files go to `<dataDir>/logs/`. */
  readonly dataDir: string;
  readonly clock: Clock;
  readonly masker: TextMasker;
  /** `ROSETTA_LOG_RETENTION_DAYS`. */
  readonly retentionDays: number;
}

const dayMs = 86_400_000;
const logFileName = /^rosetta-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** The UTC day of a log file name in milliseconds, or undefined when the name is not a log file. */
function fileDay(name: string): number | undefined {
  const day = logFileName.exec(name)?.[1];
  if (day === undefined) return undefined;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(day) ? time : undefined;
}

function startOfUtcDay(instant: Date): number {
  return Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
}

function fileFailure(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.logFileFailed, undefined, { cause: error });
}

// RF-009: one masked JSON Lines file per UTC day, `debug` and above, files older than
// ROSETTA_LOG_RETENTION_DAYS deleted by `applyRetention` at start-up.
export class JsonlFileLogger implements Logger {
  private readonly options: JsonlFileLoggerOptions;
  private readonly directory: string;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: JsonlFileLoggerOptions) {
    this.options = options;
    this.directory = join(options.dataDir, 'logs');
  }

  log(record: LogRecord): Promise<void> {
    const { clock, masker } = this.options;
    const logEntry = formatLogEntry(record, clock.now(), masker);
    const file = join(this.directory, `rosetta-${logEntry.at.slice(0, 10)}.jsonl`);
    const write = this.tail.then(() => this.append(file, toJsonLine(logEntry)));
    this.tail = write.catch(() => undefined);
    return write;
  }

  securityEvent(code: ErrorCode, detail: SecurityEventDetail): Promise<void> {
    return this.log(securityRecord(code, detail));
  }

  /** Deletes the log files older than the retention period; returns their names, sorted. */
  async applyRetention(): Promise<readonly string[]> {
    const today = startOfUtcDay(this.options.clock.now());
    const oldest = today - this.options.retentionDays * dayMs;
    try {
      const expired = (await this.fileNames()).filter((name) => {
        const day = fileDay(name);
        return day !== undefined && day < oldest;
      });
      await Promise.all(expired.map((name) => rm(join(this.directory, name), { force: true })));
      return expired.sort();
    } catch (error) {
      throw fileFailure(error);
    }
  }

  /** The names of the files in the logs folder; none before the first entry created it. */
  private async fileNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      return entries.filter((item) => item.isFile()).map((item) => item.name);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async append(file: string, line: string): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      await appendFile(file, line, 'utf8');
    } catch (error) {
      throw fileFailure(error);
    }
  }
}
