import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readAppVersion } from '../../../src/infrastructure/config/app-version.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { readMigrationFiles } from '../../../src/infrastructure/db/migration-files.js';
import {
  composeApplication,
  type Application,
} from '../../../src/presentation/composition-root.js';
import type { DatabasePool } from '../../../src/infrastructure/db/pool.js';
import {
  hasTestDatabase,
  migrationsFolder,
  useTestDatabase,
  type TestDatabase,
} from '../../support/postgres.js';

// RF-1302, RF-1303: the composed application applies the migrations, then serves /healthz with
// the version of package.json, against the disposable PostgreSQL on a loopback port. RF-009: log
// retention at start-up. P1-12: the built front end is served from `dist/web/`.

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = Buffer.alloc(32, 7).toString('base64');

/** The documented front-end build folder (tasks.md P1-12), from the repository root. */
const frontEndFolder = fileURLToPath(new URL('../../../dist/web/', import.meta.url));

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface Composed {
  readonly application: Application;
  readonly pool: DatabasePool;
  readonly dataDir: string;
}

const cleanups: string[] = [];

async function composed(database: TestDatabase): Promise<Composed> {
  const schema = await database.createSchema({ migrate: false });
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-root-'));
  cleanups.push(dataDir);
  const environment = loadEnvironment({
    DATABASE_URL: schema.url,
    ROSETTA_SECRET_KEY: testSecretKey,
    ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
    ROSETTA_DATA_DIR: dataDir,
  });
  const application = composeApplication({
    environment,
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: () => true },
  });
  return { application, pool: schema.pool, dataDir };
}

afterAll(async () => {
  await Promise.all(cleanups.map((path) => rm(path, { recursive: true, force: true })));
});

describe.skipIf(!hasTestDatabase)('composition root', () => {
  const database = useTestDatabase();

  it('RF-1302 applies the migrations before it serves, then RF-1303 /healthz answers 200', async () => {
    const { application, pool } = await composed(database);

    try {
      const address = await application.start();
      const response = await fetch(`${address}/healthz`, { signal: AbortSignal.timeout(5000) });
      const recorded = await pool.query('SELECT count(*)::int AS n FROM schema_version');
      const shipped = await readMigrationFiles(migrationsFolder);

      expect(recorded.rows[0]).toEqual({ n: shipped.length });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', version: await readAppVersion() });
    } finally {
      await application.stop();
    }
  });

  it('RF-009 deletes log files older than the retention period at start-up', async () => {
    const { application, dataDir } = await composed(database);
    const logs = join(dataDir, 'logs');
    await mkdir(logs, { recursive: true });
    const old = join(logs, 'rosetta-2020-01-01.jsonl');
    await writeFile(old, '{}\n', 'utf8');

    try {
      await application.start();

      expect(await exists(old)).toBe(false);
    } finally {
      await application.stop();
    }
  });
});

describe.skipIf(!hasTestDatabase)('composition root static files', () => {
  const database = useTestDatabase();

  it('RF-1013 serves the built front end from dist/web/', async () => {
    const createdFolder = !(await exists(frontEndFolder));
    await mkdir(frontEndFolder, { recursive: true });
    const name = `rst-static-${String(process.pid)}.txt`;
    cleanups.push(createdFolder ? frontEndFolder : join(frontEndFolder, name));
    await writeFile(join(frontEndFolder, name), 'served from dist/web\n', 'utf8');
    const { application } = await composed(database);

    try {
      const address = await application.start();
      const response = await fetch(`${address}/${name}`, { signal: AbortSignal.timeout(5000) });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('served from dist/web\n');
    } finally {
      await application.stop();
    }
  });
});
