import type { Clock } from '../../src/application/ports/clock.js';
import type { Logger, LogRecord, SecurityEventDetail } from '../../src/application/ports/logger.js';
import type { ErrorCode } from '../../src/domain/errors/codes.js';
import type { TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import {
  formatLogEntry,
  securityRecord,
  toJsonLine,
  type LogEntry,
} from '../../src/infrastructure/system/log-entry.js';

/** RF-009: keeps every entry in memory, masked like the real loggers, for tests. */
export class MemoryLogger implements Logger {
  readonly entries: LogEntry[] = [];
  private readonly clock: Clock;
  private readonly masker: TextMasker;

  constructor(clock: Clock, masker: TextMasker) {
    this.clock = clock;
    this.masker = masker;
  }

  log(record: LogRecord): Promise<void> {
    this.entries.push(formatLogEntry(record, this.clock.now(), this.masker));
    return Promise.resolve();
  }

  securityEvent(code: ErrorCode, detail: SecurityEventDetail): Promise<void> {
    return this.log(securityRecord(code, detail));
  }

  /** The entries as the JSON lines a real logger would write. */
  text(): string {
    return this.entries.map(toJsonLine).join('');
  }
}
