import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { PgSessionStore } from '../../../../src/infrastructure/db/pg-session-store.js';
import { failureOf } from '../../../support/failure-of.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../../support/postgres.js';

// ADR-016, RF-007: a database failure in PgSessionStore (here: a schema without the tables) is
// thrown as RST-2404 with the original error as cause; the session id never appears in it.
describe.skipIf(!hasTestDatabase)('PgSessionStore when the database fails', () => {
  const database = useTestDatabase();

  it('RF-1101 every PgSessionStore call fails with RST-2404', async () => {
    const { pool } = await database.createSchema({ migrate: false });
    const store = new PgSessionStore(pool);
    const id = 'a'.repeat(43);

    const failures = await Promise.all([
      failureOf(
        store.create({
          userId: '00000000-0000-4000-9000-00000000a001',
          ip: '',
          userAgent: '',
          now: testClock.now(),
        }),
      ),
      failureOf(store.touch(id, testClock.now())),
      failureOf(store.end(id)),
      failureOf(store.endAllForUser('00000000-0000-4000-9000-00000000a001')),
      failureOf(store.purgeExpired(testClock.now())),
    ]);

    for (const failure of failures) {
      expect(failure).toMatchObject({ code: ERROR_CODES.databaseQueryFailed });
      expect(String(failure)).not.toContain(id);
    }
  });
});
