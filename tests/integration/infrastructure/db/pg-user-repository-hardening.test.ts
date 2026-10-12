import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { failureOf } from '../../../support/failure-of.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// ADR-015, RNF-003, RF-1100: a failed write of an account never carries the password hash in its
// error or its cause (PostgreSQL puts the failing row in the error detail). RF-1102, P1-08: the
// advisory lock serialises concurrent first starts, so exactly one bootstrap account is created.

/** A hash-like text that only this test writes; built from pieces at run time. */
function uniqueHash(tag: string): string {
  return ['scrypt', '16384', '8', '1', `c2FsdA${tag}`, `aGFzaA${tag}`].join('$');
}

/** Everything a log could print of the failure, its cause chain included. */
function printed(failure: unknown): string {
  return inspect(failure, { depth: 10, showHidden: true }) + JSON.stringify(failure);
}

describe.skipIf(!hasTestDatabase)('PgUserRepository error causes', () => {
  const database = useTestDatabase();

  it('RF-1100 a refused insert keeps the password hash out of the error cause', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    const account = sampleAccount({ passwordHash: uniqueHash('Insert'), failedSignIns: -1 });

    const failures = [
      await failureOf(users.insert(account)),
      await failureOf(users.insertIfNoUsers(account)),
    ];

    for (const failure of failures) {
      expect(failure).toMatchObject({ code: ERROR_CODES.databaseQueryFailed });
      expect(printed(failure)).not.toContain(account.passwordHash);
    }
  });

  it('RF-1100 a refused update keeps the password hash out of the error cause', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    const stored = sampleAccount();
    await users.insert(stored);
    const changed = { ...stored, passwordHash: uniqueHash('Update'), failedSignIns: -1 };

    const failures = [
      await failureOf(users.update(changed)),
      await failureOf(users.updateIfCurrent(changed, stored)),
    ];

    for (const failure of failures) {
      expect(failure).toMatchObject({ code: ERROR_CODES.databaseQueryFailed });
      expect(printed(failure)).not.toContain(changed.passwordHash);
    }
  });
});

const BOOTSTRAP_KEY = "hashtext('rosetta.bootstrap-admin')";
const STARTS = 6;

/** Waits until `count` sessions wait for the bootstrap lock; false after about five seconds. */
async function waitForLockWaiters(pool: DatabasePool, count: number): Promise<boolean> {
  const sql = `SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid = ${BOOTSTRAP_KEY}::oid`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: number }>(sql);
    if ((result.rows[0]?.waiting ?? 0) >= count) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

describe.skipIf(!hasTestDatabase)('PgUserRepository concurrent bootstrap', () => {
  const database = useTestDatabase();

  it('RF-1102 concurrent first starts wait for the advisory lock and create one account', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    const holder = await pool.connect();
    const created = await (async () => {
      try {
        await holder.query('BEGIN');
        await holder.query(`SELECT pg_advisory_xact_lock(${BOOTSTRAP_KEY})`);
        const starts = Array.from({ length: STARTS }, () => users.insertIfNoUsers(sampleAccount()));
        const settled = Promise.all(starts);
        const waited = await waitForLockWaiters(pool, STARTS);
        await holder.query('COMMIT');
        expect(waited).toBe(true);
        return await settled;
      } finally {
        holder.release();
      }
    })();
    const counted = await pool.query<{ users: number }>('SELECT count(*)::int AS users FROM users');

    expect(created.filter(Boolean)).toHaveLength(1);
    expect(counted.rows[0]?.users).toBe(1);
  });
});
