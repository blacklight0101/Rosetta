import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-122, P1-73: a partial snapshot folder left in `<data>/sources/` by an interrupted download is
// discarded by the start-up sequence, before the server accepts runs; complete snapshots stay.

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = fixtureSecret(7);
const cleanups: string[] = [];

afterAll(async () => {
  await Promise.all(
    cleanups.map((path) =>
      rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    ),
  );
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasTestDatabase)('start-up with partial snapshot folders', () => {
  const database = useTestDatabase();

  it('RF-122 a .partial- folder left in sources/ is gone after start()', async () => {
    const schema = await database.createSchema({ migrate: true });
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-partial-'));
    cleanups.push(dataDir);
    const partial = join(dataDir, 'sources', '.partial-interrupted');
    const complete = join(dataDir, 'sources', 'github.com_owner_repo_0123abc');
    await mkdir(join(partial, 'files'), { recursive: true });
    await writeFile(join(partial, 'files', 'Program.cs'), 'class P {}\n', 'utf8');
    await mkdir(complete, { recursive: true });
    const application = composeApplication({
      environment: loadEnvironment({
        DATABASE_URL: schema.url,
        ROSETTA_SECRET_KEY: testSecretKey,
        ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
        ROSETTA_DATA_DIR: dataDir,
      }),
      listen: { host: '127.0.0.1', port: 0 },
      output: { write: () => true },
    });

    try {
      await application.start();

      expect(await exists(partial)).toBe(false);
      expect(await exists(complete)).toBe(true);
    } finally {
      await application.stop();
    }
  });
});
