import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import type { RunScope } from '../../../src/application/ports/run-events.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { JsonlEventLog } from '../../../src/infrastructure/events/jsonl-event-log.js';
import { FileRunManifestStore } from '../../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { eventFor } from '../../support/run-event-fixtures.js';
import { sampleManifest, sampleRun } from '../../support/run-fixtures.js';
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
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-1302, RF-1303: the composed application applies the migrations, then serves /healthz with
// the version of package.json, against the disposable PostgreSQL on a loopback port. RF-009: log
// retention at start-up. P1-12: the built front end is served from `dist/web/`.

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = fixtureSecret(7);

/** The documented front-end build folder (tasks.md P1-12), from the repository root. */
const frontEndFolder = fileURLToPath(new URL('../../../dist/web/', import.meta.url));

interface LeftRun {
  readonly run: Run;
  readonly scope: RunScope;
  readonly log: JsonlEventLog;
  readonly manifests: FileRunManifestStore;
}

/** A user, a project and a run that is running, with its manifest and first event on disk. */
async function seedRunningRun(pool: DatabasePool, dataDir: string): Promise<LeftRun> {
  const owner = sampleAccount({ userName: 'owner' });
  await new PgUserRepository(pool).insert(owner);
  const project = sampleProject({ userId: owner.id });
  await new PgProjectRepository(pool).insertOrFind(project);
  const index = new PgRunIndex(pool);
  const queued = sampleRun({ userId: owner.id, projectId: project.id });
  await index.insert(queued);
  const run = (await index.start(queued.id, queued.queuedAt + 1_000)) ?? queued;
  const scope = scopeOf(run);
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const writer = new NodeOutputWriter({ dataDir, logger });
  const log = new JsonlEventLog({ writer, masker });
  const manifests = new FileRunManifestStore({ writer, masker });
  await manifests.write(scope, sampleManifest({ runId: run.runKey }));
  await log.publish(scope, eventFor(scope, 1, 'run.started', { stage: 'scan' }));
  return { run, scope, log, manifests };
}

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

async function composed(database: TestDatabase, migrate = false): Promise<Composed> {
  const schema = await database.createSchema({ migrate });
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

describe.skipIf(!hasTestDatabase)('composition root and runs', () => {
  const database = useTestDatabase();

  it('RNF-002 ends a run left running by the earlier process as Interrupted before it serves', async () => {
    const { application, pool, dataDir } = await composed(database, true);
    const left = await seedRunningRun(pool, dataDir);

    try {
      await application.start();

      const row = await pool.query('SELECT queue_state, end_state FROM runs WHERE id = $1', [
        left.run.id,
      ]);
      expect(row.rows[0]).toEqual({ queue_state: 'Ended', end_state: 'Interrupted' });
      const events = await left.log.read(left.scope, 0);
      expect(events.map((event) => event.type)).toEqual(['run.started', 'run.ended']);
      expect(await left.manifests.read(left.scope)).toMatchObject({ endState: 'Interrupted' });
    } finally {
      await application.stop();
    }
  });
});

describe.skipIf(!hasTestDatabase)('composition root static files', () => {
  const database = useTestDatabase();

  it('RF-1013 serves the built front end from dist/web/ (assets need no session, RF-1009)', async () => {
    const assetsFolder = join(frontEndFolder, 'assets');
    const createdFolder = !(await exists(frontEndFolder));
    const createdAssets = !(await exists(assetsFolder));
    await mkdir(assetsFolder, { recursive: true });
    const name = `rst-static-${String(process.pid)}.txt`;
    const createdPath = createdAssets ? assetsFolder : join(assetsFolder, name);
    cleanups.push(createdFolder ? frontEndFolder : createdPath);
    await writeFile(join(assetsFolder, name), 'served from dist/web\n', 'utf8');
    const { application } = await composed(database);

    try {
      const address = await application.start();
      const response = await fetch(`${address}/assets/${name}`, {
        signal: AbortSignal.timeout(5000),
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('served from dist/web\n');
    } finally {
      await application.stop();
    }
  });
});
