import type { Clock } from '../../application/ports/clock.js';
import type {
  Logger,
  LogLevel,
  LogRecord,
  SecurityEventDetail,
} from '../../application/ports/logger.js';
import type { ErrorCode } from '../../domain/errors/codes.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { formatLogEntry, isAtLeast, securityRecord, toJsonLine } from './log-entry.js';

export interface StdoutJsonLoggerOptions {
  /** Where the lines go; `process.stdout` in the composition root. */
  readonly output: { write(text: string): unknown };
  readonly clock: Clock;
  readonly masker: TextMasker;
  /** `ROSETTA_LOG_LEVEL`. */
  readonly minLevel: LogLevel;
}

// RF-009: masked JSON lines on standard output for the container's log, at the configured level
// and above.
export class StdoutJsonLogger implements Logger {
  private readonly options: StdoutJsonLoggerOptions;

  constructor(options: StdoutJsonLoggerOptions) {
    this.options = options;
  }

  log(record: LogRecord): Promise<void> {
    const { output, clock, masker, minLevel } = this.options;
    if (isAtLeast(record.level, minLevel)) {
      output.write(toJsonLine(formatLogEntry(record, clock.now(), masker)));
    }
    return Promise.resolve();
  }

  securityEvent(code: ErrorCode, detail: SecurityEventDetail): Promise<void> {
    return this.log(securityRecord(code, detail));
  }
}
