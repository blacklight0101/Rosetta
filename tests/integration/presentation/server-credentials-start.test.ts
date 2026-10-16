import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { createPool, type DatabasePool } from '../../../src/infrastructure/db/pool.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { auditEvent, insert, ledgerRow, newId, outcomeOf, user } from '../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';
import { asRole } from '../../support/role-url.js';

// RF-1302, RF-1305, ADR-016 (DEC-140, P1-158; P1-49 F-02, F-19): the server holds DATABASE_URL
// only, never migrates, refuses a schema the migrate step has not brought up to date, and warns
// when DATABASE_URL connects as the role that owns the schema. The credential it holds in the
// deployment (rosetta_app) cannot update or delete audit_events or cost_ledger rows.

const INSUFFICIENT_PRIVILEGE = '42501';
const folders: string[] = [];
const pools: DatabasePool[] = [];

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

function ignoreIdleError(): void {
  // An idle connection closing while the test schema is dropped is not a test failure.
}

async function serverFor(databaseUrl: string, lines: string[]) {
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-credentials-'));
  folders.push(dataDir);
  return composeApplication({
    environment: loadEnvironment({
      DATABASE_URL: databaseUrl,
      ROSETTA_SECRET_KEY: fixtureSecret(11),
      ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
      ROSETTA_DATA_DIR: dataDir,
    }),
    listen: { host: '127.0.0.1', port: 0 },
    output: {
      write: (text: string) => {
        lines.push(text);
      },
    },
  });
}

const ownerWarnings = (lines: readonly string[]): string[] =>
  lines.filter((line) => line.includes('"level":"warn"') && line.includes('owns the schema'));

describe.skipIf(!hasTestDatabase)('the server credential', () => {
  const database = useTestDatabase();

  it('RF-1302 F-02 the server starts as rosetta_app, and that credential cannot update or delete audit_events or cost_ledger', async () => {
    const schema = await database.createSchema({ migrate: true });
    const ownerId = newId();
    await insert(schema.pool, user({ id: ownerId }));
    await insert(schema.pool, ledgerRow(ownerId));
    await insert(schema.pool, auditEvent());
    const serverUrl = asRole(schema.url, 'rosetta_app');
    const lines: string[] = [];
    const application = await serverFor(serverUrl, lines);
    const serverPool = createPool({ connectionString: serverUrl, onIdleError: ignoreIdleError });
    pools.push(serverPool);

    try {
      const address = await application.start();
      const health = await fetch(`${address}/healthz`, { signal: AbortSignal.timeout(5000) });
      const attempts = [
        { sql: 'UPDATE audit_events SET outcome = $1', params: ['ok'] },
        { sql: 'DELETE FROM audit_events WHERE outcome = $1', params: ['ok'] },
        { sql: 'UPDATE cost_ledger SET cost_micros = $1', params: [0] },
        { sql: 'DELETE FROM cost_ledger WHERE user_id = $1', params: [ownerId] },
      ];

      expect(health.status).toBe(200);
      for (const attempt of attempts) {
        expect(await outcomeOf(serverPool, attempt)).toBe(INSUFFICIENT_PRIVILEGE);
      }
      expect(ownerWarnings(lines)).toEqual([]);
    } finally {
      await application.stop();
    }
  });

  it('RF-1302 F-19 the server warns when DATABASE_URL connects as the role that owns the schema', async () => {
    const schema = await database.createSchema({ migrate: true });
    const lines: string[] = [];
    const application = await serverFor(schema.url, lines);

    try {
      await application.start();

      expect(ownerWarnings(lines)).toHaveLength(1);
      expect(ownerWarnings(lines)[0]).toContain('rosetta_app');
    } finally {
      await application.stop();
    }
  });
});

describe.skipIf(!hasTestDatabase)('the server never migrates', () => {
  const database = useTestDatabase();

  it('RF-1302 an empty schema is refused with RST-2405, and the server applies nothing', async () => {
    const schema = await database.createSchema({ migrate: false });
    const application = await serverFor(asRole(schema.url, 'rosetta_app'), []);

    await expect(application.start()).rejects.toMatchObject({
      code: ERROR_CODES.migrationPending,
    });
    const tables = await schema.pool.query(
      'SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1',
      [schema.name],
    );
    expect(tables.rows[0]).toEqual({ n: 0 });
  });

  it('RF-1302 a schema one migration behind the image is refused with RST-2405 before it listens', async () => {
    const schema = await database.createSchema({ migrate: true });
    await schema.pool.query(
      'DELETE FROM schema_version WHERE version = (SELECT max(version) FROM schema_version)',
    );
    const lines: string[] = [];
    const application = await serverFor(asRole(schema.url, 'rosetta_app'), lines);

    await expect(application.start()).rejects.toMatchObject({
      code: ERROR_CODES.migrationPending,
    });
    expect(lines.join('')).toContain(ERROR_CODES.migrationPending);
  });
});
