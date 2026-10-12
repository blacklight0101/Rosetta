import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { TestDoubles } from '../../../src/presentation/test-doubles.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { demoGitHub } from '../../support/snapshot-fetcher-harness.js';

// RNF-005, ADR-008: a scan run started through the HTTP API fetches from the fake GitHub injected
// through the test doubles, so the end-to-end journeys never reach github.com.

const secretKey = Buffer.alloc(32, 6).toString('base64');
const adminName = ['e2e', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

type Headers = Record<string, string>;

async function postJson(address: string, path: string, body: unknown, headers: Headers) {
  return await fetch(`${address}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:8080', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

/** A string member of a parsed JSON answer; throws when it is missing. */
function stringField(body: unknown, key: string): string {
  const value: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, key) : null;
  if (typeof value !== 'string') throw new Error(`The answer has no string "${key}".`);
  return value;
}

/** The cookie and CSRF headers of a signed-in session. */
async function signIn(address: string, password: string): Promise<Headers> {
  const response = await postJson(address, '/api/session', { userName: adminName, password }, {});
  const cookies = response.headers.getSetCookie().map((line) => line.split(';')[0] ?? '');
  return {
    cookie: cookies.join('; '),
    'x-csrf-token': stringField(await response.json(), 'csrfToken'),
  };
}

async function startScan(address: string, auth: Headers): Promise<number> {
  const url = 'https://github.com/octo/demo';
  const created = await postJson(address, '/api/projects', { url }, auth);
  const id = stringField(await created.json(), 'id');
  return (await postJson(address, `/api/projects/${id}/runs`, { stage: 'scan' }, auth)).status;
}

async function endState(query: () => Promise<string | null | undefined>): Promise<string | null> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await query();
    if (typeof state === 'string') return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

describe.skipIf(!hasTestDatabase)('test doubles in the composed application', () => {
  const database = useTestDatabase();

  it('RNF-005 a scan run fetches from the injected fake GitHub', async () => {
    const schema = await database.createSchema({ migrate: false });
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-doubles-'));
    folders.push(dataDir);
    const password = fixturePassword('Doubles');
    const environment = loadEnvironment({
      DATABASE_URL: schema.url,
      ROSETTA_SECRET_KEY: secretKey,
      ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
      ROSETTA_DATA_DIR: dataDir,
      ROSETTA_ADMIN_USER: adminName,
      ROSETTA_ADMIN_PASSWORD: password,
      ROSETTA_TEST: '1',
    });
    const github = await demoGitHub('normal');
    const application = composeApplication({
      environment,
      listen: { host: '127.0.0.1', port: 0 },
      output: { write: () => true },
      doubles: TestDoubles.create(environment, { fetch: github.fetch }),
    });

    try {
      const address = await application.start();
      const status = await startScan(address, await signIn(address, password));
      const ended = await endState(async () => {
        const rows = await schema.pool.query<{ end_state: string | null }>(
          'SELECT end_state FROM runs',
        );
        return rows.rows[0]?.end_state;
      });

      expect(status).toBe(202);
      expect(ended).toBe('Completed');
      expect(github.requests.length).toBeGreaterThan(0);
    } finally {
      await application.stop();
    }
  }, 60_000);
});
