import type { AuditEventInput } from '../../application/ports/audit-log.js';
import type { ServerCapsStore } from '../../application/ports/server-caps-store.js';
import type { SettingChange } from '../../application/ports/server-settings.js';
import type { ServerCaps } from '../../domain/budget/budget.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { AUDIT_INSERT, auditRowValues } from './pg-audit-log.js';
import { capsJson, UPSERT_VALUE } from './pg-server-settings.js';
import type { DatabaseClient, DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-1106, RF-1109: the caps and the audit row of a caps change in
// one transaction, both or neither (ServerCapsStore). The caps are checked before anything is
// written; a failed insert of either rolls the whole change back.

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgServerCapsStore implements ServerCapsStore {
  private readonly pool: DatabasePool;
  private readonly masker: TextMasker;

  constructor(pool: DatabasePool, masker: TextMasker) {
    this.pool = pool;
    this.masker = masker;
  }

  async saveCaps(caps: ServerCaps, change: SettingChange, audit: AuditEventInput): Promise<void> {
    const json = capsJson(caps);
    const auditValues = auditRowValues(audit, this.masker);
    let client: DatabaseClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw queryFailed(error);
    }
    try {
      await client.query('BEGIN');
      await client.query(UPSERT_VALUE, ['caps', json, change.at, change.by]);
      await client.query(AUDIT_INSERT, auditValues);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw queryFailed(error);
    } finally {
      client.release();
    }
  }
}
