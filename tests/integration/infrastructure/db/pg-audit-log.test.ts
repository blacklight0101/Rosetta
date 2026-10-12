import { describe, expect, it } from 'vitest';
import { PgAuditLog } from '../../../../src/infrastructure/db/pg-audit-log.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { auditLogContract } from '../../../contracts/audit-log.contract.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016: PgAuditLog passes the AuditLog contract on the disposable
// PostgreSQL, one migrated schema per test. RF-1109: the stored row holds no password.
describe.skipIf(!hasTestDatabase)('PgAuditLog', () => {
  const database = useTestDatabase();

  auditLogContract('PgAuditLog', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    return new PgAuditLog(pool, new SecretMasker());
  });

  it('RF-1109 the audit_events row itself holds no password', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const audit = new PgAuditLog(pool, new SecretMasker());
    const password = fixturePassword('Row');

    await audit.record({
      at: testClock.now(),
      actorUserId: null,
      action: 'auth.sign_in',
      targetType: null,
      targetId: null,
      ip: '203.0.113.7',
      outcome: 'failed',
      detail: { password },
    });
    const stored = await pool.query('SELECT * FROM audit_events');

    expect(stored.rows).toHaveLength(1);
    expect(JSON.stringify(stored.rows)).not.toContain(password);
  });
});
