import type { AuditRetention } from '../../application/ports/audit-retention.js';
import type { Clock } from '../../application/ports/clock.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { MemoryAuditLog } from './memory-audit-log.js';

// RF-1109, DEC-132: the retention over the in-memory audit log, for unit tests. Like the database
// function it measures the 365 days on its own clock, not on the caller's cut-off, and refuses a
// younger cut-off; it passes the same contract suite as PgAuditRetention.

const FLOOR_MS = 365 * 86_400_000;

export class MemoryAuditRetention implements AuditRetention {
  private readonly log: MemoryAuditLog;
  private readonly clock: Clock;

  constructor(log: MemoryAuditLog, clock: Clock) {
    this.log = log;
    this.clock = clock;
  }

  purgeBefore(cutOff: Date): Promise<number> {
    if (cutOff.getTime() > this.clock.now().getTime() - FLOOR_MS) {
      return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
    }
    return Promise.resolve(this.log.removeBefore(cutOff));
  }
}
