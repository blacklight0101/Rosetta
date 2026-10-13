import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { AuditRetention } from '../ports/audit-retention.js';
import type { ScheduledJob } from '../ports/scheduler.js';

// STUB for the red commit.
export const AUDIT_RETENTION_DAYS = 365;
export const CLOCK_SKEW_MARGIN_MS = 0;

export interface AuditRetentionDeps {
  readonly retention: AuditRetention;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function auditRetentionJob(deps: AuditRetentionDeps): ScheduledJob {
  void deps;
  return () => Promise.resolve();
}
