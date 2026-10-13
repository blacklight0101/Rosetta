import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import { SignIn } from '../../src/application/use-cases/sign-in.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { PgUserRepository } from '../../src/infrastructure/db/pg-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakePasswordHasher, fixturePassword, sampleAccount } from './account-fixtures.js';
import { testClock, type useTestDatabase } from './postgres.js';
import { RecordingLogger } from './recording-logger.js';

// Sign-in race tests on PostgreSQL: one account (amy) in a migrated schema, and a hasher whose
// verification first lets an administrator change the account, between the read and the write.

export interface Setup {
  readonly users: PgUserRepository;
  readonly hasher: FakePasswordHasher;
  readonly password: string;
  readonly amy: UserAccount;
  readonly auditLog: MemoryAuditLog;
  readonly parts: {
    readonly users: PgUserRepository;
    readonly sessions: MemorySessionStore;
    readonly auditLog: MemoryAuditLog;
    readonly logger: RecordingLogger;
    readonly clock: typeof testClock;
  };
}

export async function setUp(database: ReturnType<typeof useTestDatabase>): Promise<Setup> {
  const { pool } = await database.createSchema({ migrate: true });
  const users = new PgUserRepository(pool);
  const hasher = new FakePasswordHasher();
  const password = fixturePassword('Amy');
  const amy = sampleAccount({ userName: 'amy', passwordHash: await hasher.hash(password) });
  await users.insert(amy);
  const auditLog = new MemoryAuditLog(new SecretMasker());
  const parts = {
    users,
    sessions: new MemorySessionStore(),
    auditLog,
    logger: new RecordingLogger(),
    clock: testClock,
  };
  return { users, hasher, password, amy, auditLog, parts };
}

/** A hasher whose verification first lets an administrator change the account. */
export function racingHasher(setup: Setup, meanwhile: UserAccount): PasswordHasher {
  return {
    hash: (password) => setup.hasher.hash(password),
    verify: async (candidate, hash) => {
      await setup.users.update(meanwhile);
      return setup.hasher.verify(candidate, hash);
    },
  };
}

export function signInWith(setup: Setup, hasher: PasswordHasher): SignIn {
  return new SignIn({ ...setup.parts, hasher, dummyHash: 'fake$dummy' });
}

export async function lockEvents(setup: Setup): Promise<number> {
  return (await setup.auditLog.list({ since: 0, action: 'auth.locked' })).length;
}
