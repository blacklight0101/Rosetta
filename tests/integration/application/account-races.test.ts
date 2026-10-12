import { describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import { ChangePassword } from '../../../src/application/use-cases/change-password.js';
import { ResetPassword } from '../../../src/application/use-cases/reset-password.js';
import { UpdateUser } from '../../../src/application/use-cases/update-user.js';
import { actorOf } from '../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { MemoryAuditLog } from '../../../src/infrastructure/db/memory-audit-log.js';
import { MemorySessionStore } from '../../../src/infrastructure/db/memory-session-store.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import {
  commonPasswords,
  FakePasswordHasher,
  fixturePassword,
  sampleAccount,
} from '../../support/account-fixtures.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../support/postgres.js';
import { RecordingLogger } from '../../support/recording-logger.js';

// RF-1102, RF-1103 on PostgreSQL: a password change that races an administrator's disable is
// refused and never puts the account back to Active (the write is conditional on the state and
// the update time it read); an administrator cannot disable or reset their own account when the
// id in the URL is written in upper case.

const client = { ip: '203.0.113.7', userAgent: 'Browser/1.0' };

async function setUp(database: ReturnType<typeof useTestDatabase>) {
  const { pool } = await database.createSchema({ migrate: true });
  const users = new PgUserRepository(pool);
  const hasher = new FakePasswordHasher();
  const password = fixturePassword('Amy');
  const amy = sampleAccount({ userName: 'amy', passwordHash: await hasher.hash(password) });
  const root = sampleAccount({
    id: 'a0b1c2d3-e4f5-4a6b-8c7d-e8f9a0b1c2d3',
    userName: 'root',
    role: 'admin',
  });
  await users.insert(amy);
  await users.insert(root);
  const parts = {
    users,
    sessions: new MemorySessionStore(),
    auditLog: new MemoryAuditLog(new SecretMasker()),
    logger: new RecordingLogger(),
    clock: testClock,
  };
  return { users, hasher, password, amy, root, parts };
}

describe.skipIf(!hasTestDatabase)('account changes that race on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1102 a password change racing a disable is refused; the account stays disabled', async () => {
    const { users, hasher, password, amy, parts } = await setUp(database);
    const racing: PasswordHasher = {
      hash: async (next) => {
        await users.update({ ...amy, state: 'Disabled' });
        return hasher.hash(next);
      },
      verify: (candidate, hash) => hasher.verify(candidate, hash),
    };
    const changePassword = new ChangePassword({ ...parts, hasher: racing, commonPasswords });

    const outcome = await changePassword.execute({
      actor: actorOf(amy),
      currentPassword: password,
      newPassword: fixturePassword('Renewed'),
      ...client,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.accountStateInvalid });
    expect(await users.findById(amy.id)).toMatchObject({
      state: 'Disabled',
      passwordHash: amy.passwordHash,
    });
  });

  it('RF-1102 an administrator cannot disable or reset their own account by an upper-case id', async () => {
    const { users, hasher, root, parts } = await setUp(database);
    const ownId = root.id.toUpperCase();
    const updateUser = new UpdateUser(parts);
    const resetPassword = new ResetPassword({ ...parts, hasher, commonPasswords });

    const disabled = await updateUser.execute({
      actor: actorOf(root),
      userId: ownId,
      change: 'disable',
      ip: client.ip,
    });
    const reset = await resetPassword.execute({
      actor: actorOf(root),
      userId: ownId,
      password: fixturePassword('Reset'),
      ip: client.ip,
    });

    expect(disabled).toEqual({ ok: false, error: ERROR_CODES.ownAccountRefused });
    expect(reset).toEqual({ ok: false, error: ERROR_CODES.ownAccountRefused });
    expect((await users.findById(root.id))?.state).toBe('Active');
  });
});
