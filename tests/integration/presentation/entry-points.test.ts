import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-1302, RF-1305, ADR-014 (DEC-140, P1-158): the two processes of the image, run as the image
// runs them. The migrate step (src/presentation/migrate.ts) ends with 0 when the schema is up to
// date, also when run twice, and with 1 when it fails, which is what keeps Compose from starting
// the app (`service_completed_successfully`). The server (src/presentation/main.ts) given a
// migrator URL ends with 1 and a line that names the variable to remove, never its value.

const timeoutMs = 60_000;
// A fake password built from pieces; every URL with it points at a closed port.
const FAKE_PASSWORD = ['entry', 'point', 'fake'].join('-');
const closedPortUrl = (user: string): string =>
  `postgres://${user}:${FAKE_PASSWORD}@127.0.0.1:1/rosetta`;
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(
    folders.map((folder) =>
      rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    ),
  );
});

interface Ended {
  readonly code: number | null;
  readonly output: string;
}

/** The parent's environment without any Rosetta or database variable, plus `variables`. */
function cleanEnvironment(variables: Record<string, string>): Record<string, string | undefined> {
  const kept = Object.entries(process.env).filter(
    ([name]) => !name.startsWith('ROSETTA_') && !name.startsWith('DATABASE_'),
  );
  return { ...Object.fromEntries(kept), ...variables };
}

function runEntry(file: string, variables: Record<string, string>): Promise<Ended> {
  const child = spawn(process.execPath, ['--import', './scripts/register-ts.mjs', file], {
    env: cleanEnvironment(variables),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collect = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return new Promise((resolve) => {
    child.once('close', (code) => {
      resolve({ code, output });
    });
  });
}

describe('server process', () => {
  it(
    'RF-1305 refuses to start when it is given DATABASE_MIGRATOR_URL and says what to change',
    async () => {
      const dataDir = await mkdtemp(join(tmpdir(), 'rst-entry-'));
      folders.push(dataDir);

      const ended = await runEntry('src/presentation/main.ts', {
        DATABASE_URL: closedPortUrl('rosetta_app'),
        DATABASE_MIGRATOR_URL: closedPortUrl('rosetta_migrator'),
        ROSETTA_SECRET_KEY: fixtureSecret(13),
        ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
        ROSETTA_DATA_DIR: dataDir,
      });

      expect(ended.code).toBe(1);
      expect(ended.output).toContain(ERROR_CODES.configurationInvalid);
      expect(ended.output).toContain('DATABASE_MIGRATOR_URL');
      expect(ended.output).toContain('remove it from the server');
      expect(ended.output).not.toContain(FAKE_PASSWORD);
    },
    timeoutMs,
  );
});

describe('migrate step process', () => {
  it(
    'RF-1302 F-19 ends with 1 and names DATABASE_MIGRATOR_URL when only DATABASE_URL is set',
    async () => {
      const ended = await runEntry('src/presentation/migrate.ts', {
        DATABASE_URL: closedPortUrl('rosetta_app'),
      });

      expect(ended.code).toBe(1);
      expect(ended.output).toContain('DATABASE_MIGRATOR_URL is missing');
      expect(ended.output).not.toContain(FAKE_PASSWORD);
    },
    timeoutMs,
  );

  it(
    'RF-1302 ends with 1 when the database cannot be reached, so the server is not started',
    async () => {
      const ended = await runEntry('src/presentation/migrate.ts', {
        DATABASE_MIGRATOR_URL: closedPortUrl('rosetta_migrator'),
      });

      expect(ended.code).toBe(1);
      expect(ended.output).not.toContain(FAKE_PASSWORD);
    },
    timeoutMs,
  );
});

describe.skipIf(!hasTestDatabase)('migrate step process on a database', () => {
  const database = useTestDatabase();

  it(
    'RF-1302 ends with 0, and run a second time it ends with 0 and applies nothing',
    async () => {
      const schema = await database.createSchema({ migrate: false });

      const first = await runEntry('src/presentation/migrate.ts', {
        DATABASE_MIGRATOR_URL: schema.url,
      });
      const second = await runEntry('src/presentation/migrate.ts', {
        DATABASE_MIGRATOR_URL: schema.url,
      });

      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.output).toContain('Applied 0 migration(s).');
    },
    timeoutMs,
  );
});
