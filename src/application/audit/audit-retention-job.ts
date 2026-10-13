import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AuditRetention } from '../ports/audit-retention.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ScheduledJob } from '../ports/scheduler.js';

// RF-1109, DEC-132: audit rows are kept for 365 days; the daily job asks the store to delete the
// older ones. The store measures the 365 days on its own clock and refuses a younger cut-off, so
// the cut-off asks for a little more than 365 days: with the margin, an application clock that
// runs ahead of the database clock by less than an hour still gets its cut-off accepted.

export const AUDIT_RETENTION_DAYS = 365;
export const CLOCK_SKEW_MARGIN_MS = 3_600_000;

const DAY_MS = 86_400_000;

export interface AuditRetentionDeps {
  readonly retention: AuditRetention;
  readonly clock: Clock;
  readonly logger: Logger;
}

function failureCode(error: unknown) {
  return error instanceof RosettaError ? error.code : ERROR_CODES.databaseQueryFailed;
}

/** The scheduled job; it never rejects, so a failing purge cannot stop the server. */
export function auditRetentionJob(deps: AuditRetentionDeps): ScheduledJob {
  const { retention, clock, logger } = deps;
  return async () => {
    const cutOff = new Date(
      clock.now().getTime() - AUDIT_RETENTION_DAYS * DAY_MS - CLOCK_SKEW_MARGIN_MS,
    );
    try {
      const deleted = await retention.purgeBefore(cutOff);
      await logger.log({
        level: 'info',
        logger: 'audit-retention',
        message: `Deleted ${String(deleted)} audit row(s) older than ${String(AUDIT_RETENTION_DAYS)} days.`,
        data: { deleted },
      });
    } catch (error) {
      await logger
        .log({
          level: 'error',
          logger: 'audit-retention',
          message: 'The audit retention purge failed; it runs again at the next interval.',
          code: failureCode(error),
        })
        .catch(() => undefined);
    }
  };
}
