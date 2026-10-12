import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { TestDoubles } from '../../../src/presentation/test-doubles.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { useWritableTempRoot } from '../../support/writable-temp-root.js';
import { demoGitHub } from '../../support/snapshot-fetcher-harness.js';

// RNF-005, ADR-008: a scan run started through the HTTP API fetches from the fake GitHub injected
// through the test doubles, so the end-to-end journeys never reach github.com.

const secretKey = Buffer.alloc(32, 6).toString('base64');
const adminName = ['e2e', 'admin'].join('.');

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

/** The cookies a response sets, merged over the ones the browser already has. */
function keepCookies(response: Response, known: Map<string, string>): Map<string, string> {
  for (const line of response.headers.getSetCookie()) {
    const [pair = ''] = line.split(';', 1);
    const at = pair.indexOf('=');
    known.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return known;
}

/** The headers a browser sends with these cookies and token. */
function authHeaders(cookies: Map<string, string>, token: string): Headers {
  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return { cookie, 'x-csrf-token': token };
}

/**
 * The cookie and CSRF headers of a signed-in session. The bootstrap administrator must change its
 * password before it reaches the projects API (RF-1102), so the session changes it first.
 */
async function signIn(address: string, password: string): Promise<Headers> {
  const response = await postJson(address, '/api/session', { userName: adminName, password }, {});
  const cookies = keepCookies(response, new Map());
  const token = stringField(await response.json(), 'csrfToken');
  const newPassword = fixturePassword('DoublesNew');
  const changed = await postJson(
    address,
    '/api/account/password',
    { currentPassword: password, newPassword },
    authHeaders(cookies, token),
  );
  keepCookies(changed, cookies);
  return authHeaders(cookies, stringField(await changed.json(), 'csrfToken'));
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
  // The snapshot the scan downloads is read-only (RF-005), so the folder is made writable to delete.
  const data = useWritableTempRoot('rst-doubles-');

  it('RNF-005 a scan run fetches from the injected fake GitHub', async () => {
    const schema = await database.createSchema({ migrate: false });
    const password = fixturePassword('Doubles');
    const environment = loadEnvironment({
      DATABASE_URL: schema.url,
      ROSETTA_SECRET_KEY: secretKey,
      ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
      ROSETTA_DATA_DIR: data.path,
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
