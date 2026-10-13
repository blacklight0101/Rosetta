import { describe } from 'vitest';
import { PgAuditLog } from '../../../../src/infrastructure/db/pg-audit-log.js';
import { PgAuditRetention } from '../../../../src/infrastructure/db/pg-audit-retention.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { auditRetentionContract } from '../../../contracts/audit-retention.contract.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// DEC-132: PgAuditRetention passes the AuditRetention contract on the disposable PostgreSQL, one
// migrated schema per test. The database clock is the machine clock of the test run.
describe.skipIf(!hasTestDatabase)('PgAuditRetention', () => {
  const database = useTestDatabase();

  auditRetentionContract('PgAuditRetention', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    return {
      retention: new PgAuditRetention(pool),
      audit: new PgAuditLog(pool, new SecretMasker()),
      now: () => new Date(),
    };
  });
});
