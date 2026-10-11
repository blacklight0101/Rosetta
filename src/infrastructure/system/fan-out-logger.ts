import type { Logger, LogRecord, SecurityEventDetail } from '../../application/ports/logger.js';
import type { ErrorCode } from '../../domain/errors/codes.js';

async function allOrFirstFailure(writes: readonly Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(writes);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure !== undefined) throw failure.reason;
}

// RF-009: writes every entry to each logger (standard output and the daily file); one failing
// logger does not stop the others, and its failure is reported afterwards.
export class FanOutLogger implements Logger {
  private readonly loggers: readonly Logger[];

  constructor(loggers: readonly Logger[]) {
    this.loggers = loggers;
  }

  log(record: LogRecord): Promise<void> {
    return allOrFirstFailure(this.loggers.map((logger) => logger.log(record)));
  }

  securityEvent(code: ErrorCode, detail: SecurityEventDetail): Promise<void> {
    return allOrFirstFailure(this.loggers.map((logger) => logger.securityEvent(code, detail)));
  }
}
