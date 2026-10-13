import type { Logger, LogRecord, SecurityEventDetail } from '../ports/logger.js';

// RF-1011, RF-1105: the logger a run's own work writes through. Every entry names the run's owner,
// so the Logs panel can tell the run's entries from those of another user's run with the same key
// (data-model.md section 3.14). An entry that already names a user keeps it.
export function ownerLogger(logger: Logger, userId: string): Logger {
  return {
    log: (record: LogRecord) => logger.log({ userId, ...record }),
    securityEvent: (code, detail: SecurityEventDetail) =>
      logger.securityEvent(code, { userId, ...detail }),
  };
}
