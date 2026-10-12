import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { hashSessionId } from '../../../src/infrastructure/security/session-ids.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';

// RF-1100, RF-1101: the composed application signs the bootstrap administrator in over HTTP with
// the real scrypt hasher and PostgreSQL; the `sessions` row holds only the SHA-256 of the cookie's
// id, and the cookie then opens `GET /api/session`.

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = Buffer.alloc(32, 5).toString('base64');
const publicUrl = 'http://127.0.0.1:8080';
const adminName = ['start', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((header) => header.startsWith('__Host-rosetta_session='));
  return (cookie ?? '').split(';')[0]?.split('=')[1] ?? '';
}

describe.skipIf(!hasTestDatabase)('sign-in in the composed application', () => {
  const database = useTestDatabase();

  it('RF-1101 signs in, stores only the SHA-256 of the session id and opens the session', async () => {
    const schema = await database.createSchema({ migrate: false });
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-sign-in-'));
    folders.push(dataDir);
    const password = fixturePassword('Start');
    const application = composeApplication({
      environment: loadEnvironment({
        DATABASE_URL: schema.url,
        ROSETTA_SECRET_KEY: testSecretKey,
        ROSETTA_PUBLIC_URL: publicUrl,
        ROSETTA_DATA_DIR: dataDir,
        ROSETTA_ADMIN_USER: adminName,
        ROSETTA_ADMIN_PASSWORD: password,
      }),
      listen: { host: '127.0.0.1', port: 0 },
      output: { write: () => true },
    });

    try {
      const address = await application.start();
      const signIn = await fetch(`${address}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: publicUrl },
        body: JSON.stringify({ userName: adminName, password }),
        signal: AbortSignal.timeout(20_000),
      });
      const id = sessionCookie(signIn);
      const rows = await schema.pool.query<{ hash: string }>(
        "SELECT encode(id_hash, 'hex') AS hash FROM sessions",
      );
      const current = await fetch(`${address}/api/session`, {
        headers: { cookie: `__Host-rosetta_session=${id}` },
        signal: AbortSignal.timeout(5000),
      });

      expect(signIn.status).toBe(200);
      expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(rows.rows).toEqual([{ hash: hashSessionId(id).toString('hex') }]);
      expect(current.status).toBe(200);
      expect(await current.json()).toMatchObject({
        user: { userName: adminName, role: 'admin', state: 'MustChangePassword' },
      });
    } finally {
      await application.stop();
    }
  }, 60_000);
});
