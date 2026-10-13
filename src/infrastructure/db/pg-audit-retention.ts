import type { AuditRetention } from '../../application/ports/audit-retention.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// RF-1109, DEC-132, data-model.md sections 4 and 6: rosetta_app cannot delete audit rows; it calls
// the SECURITY DEFINER function of migration 0008, which refuses a cut-off younger than 365 days
// on the database clock. The deleted count comes back as a bigint (a string from `pg`).

const PURGE = 'SELECT purge_audit_events_before($1::timestamptz) AS deleted';

export class PgAuditRetention implements AuditRetention {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async purgeBefore(cutOff: Date): Promise<number> {
    try {
      const result = await this.pool.query<{ deleted: string }>(PURGE, [cutOff]);
      return Number(result.rows[0]?.deleted ?? 0);
    } catch (error) {
      throw new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
    }
  }
}
