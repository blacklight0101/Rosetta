import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { PgAuditLog } from '../../../../src/infrastructure/db/pg-audit-log.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { failureOf } from '../../../support/failure-of.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../../support/postgres.js';

// ADR-016, RF-007: a database failure in the account adapters (here: a schema without the
// tables) is thrown as RST-2404 with the original error as cause; the hash never appears in it.

describe.skipIf(!hasTestDatabase)('account adapters when the database fails', () => {
  const database = useTestDatabase();

  it('RF-1102 every PgUserRepository call fails with RST-2404', async () => {
    const { pool } = await database.createSchema({ migrate: false });
    const users = new PgUserRepository(pool);
    const account = sampleAccount();

    const failures = await Promise.all([
      failureOf(users.insert(account)),
      failureOf(users.insertIfNoUsers(account)),
      failureOf(users.hasUsers()),
      failureOf(users.findById(account.id)),
      failureOf(users.findByUserName('teacher')),
      failureOf(users.list()),
      failureOf(users.update(account)),
    ]);

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(RosettaError);
      expect(failure).toMatchObject({ code: ERROR_CODES.databaseQueryFailed });
      expect(String(failure)).not.toContain(account.passwordHash);
    }
  });

  it('RF-1109 every PgAuditLog call fails with RST-2404', async () => {
    const { pool } = await database.createSchema({ migrate: false });
    const audit = new PgAuditLog(pool, new SecretMasker());
    const event = {
      at: testClock.now(),
      actorUserId: null,
      action: 'auth.sign_in',
      targetType: null,
      targetId: null,
      ip: '203.0.113.7',
      outcome: 'failed',
      detail: {},
    } as const;

    const failures = await Promise.all([
      failureOf(audit.record(event)),
      failureOf(audit.list({ since: testClock.now() })),
    ]);

    for (const failure of failures) {
      expect(failure).toMatchObject({ code: ERROR_CODES.databaseQueryFailed });
    }
  });
});

describe.skipIf(!hasTestDatabase)('PgUserRepository with a malformed id', () => {
  const database = useTestDatabase();

  it('RF-1102 a malformed id names no account and changes nothing', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);

    expect(await users.findById('not-a-uuid')).toBeUndefined();
    expect(await users.update(sampleAccount({ id: 'not-a-uuid' }))).toBe(false);
  });
});
