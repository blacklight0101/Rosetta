import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { keyAdditionalData } from '../../../src/domain/accounts/provider-keys.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { PgProviderKeyRepository } from '../../../src/infrastructure/db/pg-provider-key-repository.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../../../src/infrastructure/db/pool.js';
import { AesGcmSecretBox } from '../../../src/infrastructure/security/aes-gcm-secret-box.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import {
  fixtureKey,
  fixtureSecret,
  hex,
  sampleKeyRecord,
} from '../../support/provider-key-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';

// RF-1104, DEC-112: with ROSETTA_SECRET_KEY_PREVIOUS set, the composed application re-encrypts the
// rows sealed under the previous key before it serves; a second start changes nothing; a row under
// a key version the server does not hold is reported in the log (code RST-2300) and kept.

const previous = fixtureSecret(31);
const current = fixtureSecret(32);
const cleanups: string[] = [];

afterAll(async () => {
  await Promise.all(
    cleanups.map((path) =>
      rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
    ),
  );
});

async function startAndStop(url: string, output: string[]): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-keys-'));
  cleanups.push(dataDir);
  const application = composeApplication({
    environment: loadEnvironment({
      DATABASE_URL: url,
      ROSETTA_SECRET_KEY: current,
      ROSETTA_SECRET_KEY_PREVIOUS: previous,
      ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
      ROSETTA_DATA_DIR: dataDir,
    }),
    listen: { host: '127.0.0.1', port: 0 },
    output: { write: (text: string) => output.push(text) },
  });
  try {
    await application.start();
  } finally {
    await application.stop();
  }
}

async function seed(pool: DatabasePool): Promise<{ amy: string; bob: string; key: string }> {
  const users = new PgUserRepository(pool);
  const amy = sampleAccount();
  const bob = sampleAccount();
  await users.insert(amy);
  await users.insert(bob);
  const keys = new PgProviderKeyRepository(pool);
  const key = fixtureKey('Rotated01');
  const old = new AesGcmSecretBox({ current: previous });
  const sealed = old.seal(key, keyAdditionalData(amy.id, 'openai'));
  await keys.upsert(sampleKeyRecord(amy.id, 'openai', { sealed }));
  const stranger = new AesGcmSecretBox({ current: fixtureSecret(33) });
  const strangers = stranger.seal(fixtureKey('Stranger01'), keyAdditionalData(bob.id, 'openai'));
  await keys.upsert(sampleKeyRecord(bob.id, 'openai', { sealed: strangers }));
  return { amy: amy.id, bob: bob.id, key };
}

/** The stored row of the user's OpenAI key: its key version and ciphertext as text. */
async function rowOf(keys: PgProviderKeyRepository, userId: string) {
  const record = await keys.find(userId, 'openai');
  if (record === undefined) throw new Error('row expected');
  return { record, version: record.sealed.keyVersion, cipher: hex(record.sealed.ciphertext) };
}

describe.skipIf(!hasTestDatabase)('key rotation at start-up', () => {
  const database = useTestDatabase();

  it('RF-1104 re-encrypts rows under the previous key at start-up, idempotently, and reports unknown versions', async () => {
    const schema = await database.createSchema({ migrate: true });
    const { amy, bob, key } = await seed(schema.pool);
    const keys = new PgProviderKeyRepository(schema.pool);
    const strangerBefore = await rowOf(keys, bob);
    const output: string[] = [];

    await startAndStop(schema.url, output);
    const rotated = await rowOf(keys, amy);
    await startAndStop(schema.url, output);

    const box = new AesGcmSecretBox({ current });
    expect(rotated.version).toBe(box.keyVersion);
    expect(box.open(rotated.record.sealed, keyAdditionalData(amy, 'openai'))).toEqual({
      ok: true,
      value: key,
    });
    expect((await rowOf(keys, amy)).cipher).toBe(rotated.cipher);
    expect((await rowOf(keys, bob)).cipher).toBe(strangerBefore.cipher);
    const log = output.join('');
    expect(log).toContain('"code":"RST-2300"');
    expect(log).not.toContain(key);
  });
});
