import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { readMigrationFiles } from '../../../src/infrastructure/db/migration-files.js';
import { migrateDatabase } from '../../../src/presentation/compose-migrations.js';
import { hasTestDatabase, migrationsFolder, useTestDatabase } from '../../support/postgres.js';

// RF-1302, ADR-016 (DEC-140, P1-158): the one-off migrate step applies the pending migrations
// with DATABASE_MIGRATOR_URL and ends; run again it applies nothing; a failure is logged with its
// code and rethrown, so the step ends with an error and the server is not started after it.

// A fake password built from pieces; the URL points at a closed port, so nothing is sent anywhere.
const FAKE_PASSWORD = ['never', 'printed', 'pw'].join('-');
const closedPortUrl = `postgres://rosetta_migrator:${FAKE_PASSWORD}@127.0.0.1:1/rosetta`;

function capture(): { readonly lines: string[]; readonly output: { write(text: string): true } } {
  const lines: string[] = [];
  return {
    lines,
    output: {
      write: (text: string) => {
        lines.push(text);
        return true;
      },
    },
  };
}

describe.skipIf(!hasTestDatabase)('migrate step', () => {
  const database = useTestDatabase();

  it('RF-1302 applies every pending migration, then a second run applies nothing', async () => {
    const schema = await database.createSchema({ migrate: false });
    const shipped = await readMigrationFiles(migrationsFolder);
    const first = capture();
    const second = capture();
    const environment = { databaseMigratorUrl: schema.url, logLevel: 'info' } as const;

    const applied = await migrateDatabase({ environment, output: first.output });
    const again = await migrateDatabase({ environment, output: second.output });

    expect(applied.map((migration) => migration.version)).toEqual(
      shipped.map((file) => file.version),
    );
    expect(again).toEqual([]);
    expect(first.lines.join('')).toContain(`Applied ${String(shipped.length)} migration(s).`);
    expect(second.lines.join('')).toContain('Applied 0 migration(s).');
    const recorded = await schema.pool.query('SELECT count(*)::int AS n FROM schema_version');
    expect(recorded.rows[0]).toEqual({ n: shipped.length });
  });
});

describe('migrate step failure', () => {
  it('RF-1302 a database it cannot reach fails the step, logged without the password', async () => {
    const { lines, output } = capture();

    await expect(
      migrateDatabase({
        environment: { databaseMigratorUrl: closedPortUrl, logLevel: 'info' },
        output,
      }),
    ).rejects.toThrow();

    const text = lines.join('');
    expect(text).toContain('"level":"error"');
    expect(text).toContain('migrate');
    expect(text).not.toContain(FAKE_PASSWORD);
  });
});

describe.skipIf(!hasTestDatabase)('migrate step refusal', () => {
  const database = useTestDatabase();

  it('RF-1302 a database with a migration the image does not know fails the step with RST-2402, logged', async () => {
    const schema = await database.createSchema({ migrate: true });
    await schema.pool.query(
      "INSERT INTO schema_version (version, name, checksum, applied_at) VALUES (9999, '9999_future.sql', 'abc', now())",
    );
    const { lines, output } = capture();

    await expect(
      migrateDatabase({
        environment: { databaseMigratorUrl: schema.url, logLevel: 'info' },
        output,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.migrationUnknown });

    expect(lines.join('')).toContain(ERROR_CODES.migrationUnknown);
  });
});
