import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { fixturePassword } from '../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-1102: at the first start of an empty database the composed application creates the
// administrator from ROSETTA_ADMIN_USER and ROSETTA_ADMIN_PASSWORD, once, in MustChangePassword;
// neither value is ever written to the log. A second start with the variables set creates no
// second account.

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = fixtureSecret(9);
const adminName = ['first', 'admin'].join('.');
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(
    folders.map((folder) =>
      rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    ),
  );
});

interface Started {
  readonly output: string;
  readonly failure?: unknown;
}

async function startOnce(url: string, password: string): Promise<Started> {
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-boot-'));
  folders.push(dataDir);
  const lines: string[] = [];
  const application = composeApplication({
    environment: loadEnvironment({
      DATABASE_URL: url,
      ROSETTA_SECRET_KEY: testSecretKey,
      ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
      ROSETTA_DATA_DIR: dataDir,
      ROSETTA_ADMIN_USER: adminName,
      ROSETTA_ADMIN_PASSWORD: password,
      ROSETTA_LOG_LEVEL: 'debug',
    }),
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: (text: string) => lines.push(text) },
  });
  try {
    await application.start();
    await application.stop();
    return { output: lines.join('') };
  } catch (error) {
    return { output: lines.join(''), failure: error };
  }
}

describe.skipIf(!hasTestDatabase)('bootstrap administrator at start-up', () => {
  const database = useTestDatabase();

  it('RF-1102 creates the administrator once, and a second start creates no second account', async () => {
    const schema = await database.createSchema({ migrate: true });
    const password = fixturePassword('Start');

    const first = await startOnce(schema.url, password);
    const second = await startOnce(schema.url, fixturePassword('Second'));
    const users = await schema.pool.query<{ user_name: string; role: string; state: string }>(
      'SELECT user_name, role, state FROM users',
    );

    expect(first.failure).toBeUndefined();
    expect(second.failure).toBeUndefined();
    expect(users.rows).toEqual([
      { user_name: adminName, role: 'admin', state: 'MustChangePassword' },
    ]);
  });

  it('RF-1102 never writes the user name or the password to the log', async () => {
    const schema = await database.createSchema({ migrate: true });
    const password = fixturePassword('Log');

    const started = await startOnce(schema.url, password);
    const audit = await schema.pool.query('SELECT * FROM audit_events');

    expect(started.output).toContain('bootstrap administrator');
    expect(started.output).not.toContain(password);
    expect(started.output).not.toContain(adminName);
    expect(JSON.stringify(audit.rows)).not.toContain(password);
  });

  it('RF-1103 a weak bootstrap password stops the start-up and creates nothing', async () => {
    const schema = await database.createSchema({ migrate: true });
    const password = ['Ab1', 'Cd2'].join('-');

    const started = await startOnce(schema.url, password);
    const users = await schema.pool.query('SELECT count(*)::int AS n FROM users');

    expect(started.failure).toMatchObject({ code: ERROR_CODES.passwordTooShort });
    expect(JSON.stringify(started)).not.toContain(password);
    expect(String(started.failure)).not.toContain(password);
    expect(users.rows[0]).toEqual({ n: 0 });
  });
});
