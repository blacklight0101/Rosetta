import type { Logger, LogRecord, SecurityEventDetail } from '../../src/application/ports/logger.js';
import type { ErrorCode } from '../../src/domain/errors/codes.js';

/**
 * Keeps every record exactly as the caller passed it, with no masking, so a test can prove that a
 * component never hands a secret to the logger (RF-123, RNF-003). MemoryLogger masks, which would
 * hide such a defect.
 */
export class RecordingLogger implements Logger {
  readonly records: LogRecord[] = [];

  log(record: LogRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }

  securityEvent(code: ErrorCode, detail: SecurityEventDetail): Promise<void> {
    return this.log({ level: 'warn', logger: 'security', code, ...detail });
  }

  /** Everything that was logged, serialised unmasked. */
  text(): string {
    return JSON.stringify(this.records);
  }
}
