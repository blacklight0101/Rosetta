import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { AesGcmSecretBox } from '../../../src/infrastructure/security/aes-gcm-secret-box.js';
import { composeAuth } from '../../../src/presentation/compose-accounts.js';
import { EventStream } from '../../../src/presentation/web/event-stream.js';
import { FakePasswordHasher } from '../../support/account-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';
import { sequenceSessionIds } from '../../support/session-fixtures.js';

// RF-1101, P1-160 (F-09): the session store the composition root gives every use case ends the
// open event streams of the sessions it ends, before it touches the database, so a sign-out or a
// disable ends them even while PostgreSQL is down.

const unreachable = ['postgres://u:p', '@127.0.0.1:1/none'].join('');
const [userOne, userTwo] = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
];
const nextSession = sequenceSessionIds();
const [sessionOne, sessionTwo] = [nextSession(), nextSession()];

async function composedAuth() {
  const clock = new FixedClock('2026-10-14T09:00:00.000Z');
  const masker = new SecretMasker();
  const pool = createPool({ connectionString: unreachable, onIdleError: () => undefined });
  const environment = loadEnvironment({
    DATABASE_URL: unreachable,
    ROSETTA_SECRET_KEY: fixtureSecret(3),
    ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
    ROSETTA_DATA_DIR: tmpdir(),
  });
  const auth = await composeAuth(
    { environment },
    {
      ...{ pool, clock, masker, hasher: new FakePasswordHasher() },
      logger: new MemoryLogger(clock, masker),
      secretBox: new AesGcmSecretBox({ current: fixtureSecret(3) }),
    },
  );
  return { auth, pool };
}

describe('composeAuth and the open event streams', () => {
  it('RF-1101 ending every session of a user ends that user streams only, even when the database fails', async () => {
    const { auth, pool } = await composedAuth();
    const [mine, other] = [new EventStream(), new EventStream()];
    auth.streams.add(mine, { userId: userOne, sessionId: sessionOne });
    auth.streams.add(other, { userId: userTwo, sessionId: sessionTwo });

    await expect(auth.sessions.endAllForUser(userOne)).rejects.toThrow();

    expect(mine.destroyed).toBe(true);
    expect(other.destroyed).toBe(false);
    await pool.end();
  });

  it('RF-1101 ending one session ends the streams of that session only, even when the database fails', async () => {
    const { auth, pool } = await composedAuth();
    const [tab1, tab2, other] = [new EventStream(), new EventStream(), new EventStream()];
    auth.streams.add(tab1, { userId: userOne, sessionId: sessionOne });
    auth.streams.add(tab2, { userId: userOne, sessionId: sessionOne });
    auth.streams.add(other, { userId: userOne, sessionId: sessionTwo });

    await expect(auth.sessions.end(sessionOne)).rejects.toThrow();

    expect([tab1.destroyed, tab2.destroyed, other.destroyed]).toEqual([true, true, false]);
    await pool.end();
  });
});
