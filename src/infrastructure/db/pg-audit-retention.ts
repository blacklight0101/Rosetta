import type { AuditRetention } from '../../application/ports/audit-retention.js';
import type { DatabasePool } from './pool.js';

// STUB for the red commit.
export class PgAuditRetention implements AuditRetention {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  purgeBefore(cutOff: Date): Promise<number> {
    void this.pool;
    void cutOff;
    return Promise.resolve(0);
  }
}
