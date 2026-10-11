import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readAppVersion } from '../../../src/infrastructure/config/app-version.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { readMigrationFiles } from '../../../src/infrastructure/db/migration-files.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { hasTestDatabase, migrationsFolder, useTestDatabase } from '../../support/postgres.js';

// RF-1302, RF-1303: the composed application applies the migrations, then serves /healthz with
// the version of package.json, against the disposable PostgreSQL on a loopback port.

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = Buffer.alloc(32, 7).toString('base64');

describe.skipIf(!hasTestDatabase)('composition root', () => {
  const database = useTestDatabase();
  const folders: string[] = [];

  afterAll(async () => {
    await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
  });

  it('RF-1302 applies the migrations before it serves, then RF-1303 /healthz answers 200', async () => {
    const schema = await database.createSchema({ migrate: false });
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-root-'));
    folders.push(dataDir);
    const environment = loadEnvironment({
      DATABASE_URL: schema.url,
      ROSETTA_SECRET_KEY: testSecretKey,
      ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
      ROSETTA_DATA_DIR: dataDir,
    });
    const lines: string[] = [];
    const application = composeApplication({
      environment,
      listen: { host: '127.0.0.1', port: 0 },
      output: { write: (text: string) => lines.push(text) },
    });

    try {
      const address = await application.start();
      const response = await fetch(`${address}/healthz`, { signal: AbortSignal.timeout(5000) });
      const recorded = await schema.pool.query('SELECT count(*)::int AS n FROM schema_version');
      const shipped = await readMigrationFiles(migrationsFolder);

      expect(recorded.rows[0]).toEqual({ n: shipped.length });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', version: await readAppVersion() });
    } finally {
      await application.stop();
    }
  });
});
