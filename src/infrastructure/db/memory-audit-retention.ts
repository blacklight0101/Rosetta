import type { AuditRetention } from '../../application/ports/audit-retention.js';
import type { Clock } from '../../application/ports/clock.js';
import type { MemoryAuditLog } from './memory-audit-log.js';

// STUB for the red commit.
export class MemoryAuditRetention implements AuditRetention {
  private readonly log: MemoryAuditLog;
  private readonly clock: Clock;

  constructor(log: MemoryAuditLog, clock: Clock) {
    this.log = log;
    this.clock = clock;
  }

  purgeBefore(cutOff: Date): Promise<number> {
    void this.log;
    void this.clock;
    void cutOff;
    return Promise.resolve(0);
  }
}
