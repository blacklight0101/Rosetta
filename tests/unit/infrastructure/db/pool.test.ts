import { afterEach, describe, expect, it } from 'vitest';
import {
  createAppPool,
  createMigratorPool,
  createPool,
  type DatabasePool,
} from '../../../../src/infrastructure/db/pool.js';

// Creating a pool opens no connection, so these tests touch no network.
const appUrl = 'postgres://rosetta_app@127.0.0.1:5432/rosetta';
const migratorUrl = 'postgres://rosetta_migrator@127.0.0.1:5432/rosetta';
const ignore = (): void => undefined;
const opened: DatabasePool[] = [];

function track(pool: DatabasePool): DatabasePool {
  opened.push(pool);
  return pool;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((pool) => pool.end()));
});

describe('createPool', () => {
  it('ADR-016 connects with the given URL and a default statement timeout', () => {
    const pool = track(createPool({ connectionString: appUrl, onIdleError: ignore }));

    expect(pool.options.connectionString).toBe(appUrl);
    expect(pool.options.statement_timeout).toBe(30_000);
    expect(pool.options.connectionTimeoutMillis).toBe(10_000);
  });

  it('ADR-016 accepts a longer statement timeout', () => {
    const pool = track(
      createPool({ connectionString: appUrl, statementTimeoutMs: 120_000, onIdleError: ignore }),
    );

    expect(pool.options.statement_timeout).toBe(120_000);
  });

  it('ADR-016 reports an idle client error instead of crashing the process', () => {
    const seen: Error[] = [];
    const pool = track(
      createPool({ connectionString: appUrl, onIdleError: (error) => seen.push(error) }),
    );

    pool.emit('error', new Error('connection lost'));

    expect(seen.map((error) => error.message)).toEqual(['connection lost']);
  });
});

describe('server pools', () => {
  it('RF-1302 the server pool uses DATABASE_URL', () => {
    const pool = track(createAppPool({ databaseUrl: appUrl }, ignore));

    expect(pool.options.connectionString).toBe(appUrl);
  });

  it('RF-1302 the migration pool uses DATABASE_MIGRATOR_URL as resolved by the environment', () => {
    const pool = track(createMigratorPool({ databaseMigratorUrl: migratorUrl }, ignore));

    expect(pool.options.connectionString).toBe(migratorUrl);
    expect(pool.options.statement_timeout).toBe(300_000);
  });
});
