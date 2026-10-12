import { actorOf } from '../../../src/domain/accounts/actor.js';
import type { Logger } from '../../../src/application/ports/logger.js';
import { CreateUser } from '../../../src/application/use-cases/create-user.js';
import { PgAuditLog } from '../../../src/infrastructure/db/pg-audit-log.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../../../src/infrastructure/security/common-passwords.js';
import { ScryptPasswordHasher } from '../../../src/infrastructure/security/scrypt-password-hasher.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../../src/infrastructure/system/timestamp-id-generator.js';
import { fixturePassword } from '../../support/account-fixtures.js';

// FAKE CREDENTIALS ONLY (RNF-003): the accounts of an end-to-end run. The test server creates the
// administrator at start-up through the bootstrap use case (RF-1102), so it must change its
// password before it reaches anything but the session API and the change-password page. Then
// `seedUsers` creates a normal user through the CreateUser use case (P1-10), without a forced
// change (RF-1107), for the journeys that need a signed-in user. The passwords are built at run
// time from harmless pieces and exist only in the disposable database of one run.

export const seededAdmin = {
  userName: ['e2e', 'admin'].join('.'),
  password: fixturePassword('E2e'),
} as const;

export const seededUser = {
  userName: ['e2e', 'user'].join('.'),
  password: fixturePassword('E2eUser'),
} as const;

const quiet: Logger = {
  log: () => Promise.resolve(),
  securityEvent: () => Promise.resolve(),
};

/** Creates `seededUser` through CreateUser, as the bootstrap administrator. */
// RF-1102
export async function seedUsers(databaseUrl: string): Promise<void> {
  const pool = createPool({ connectionString: databaseUrl, onIdleError: () => undefined });
  try {
    const users = new PgUserRepository(pool);
    const admin = await users.findByUserName(seededAdmin.userName);
    if (admin === undefined) throw new Error('The bootstrap administrator was not created.');
    const clock = new SystemClock();
    const createUser = new CreateUser({
      users,
      hasher: new ScryptPasswordHasher(),
      auditLog: new PgAuditLog(pool, new SecretMasker()),
      logger: quiet,
      clock,
      ids: new TimestampIdGenerator(clock),
      commonPasswords: await loadCommonPasswords(commonPasswordsFile),
    });
    const created = await createUser.execute({
      actor: actorOf(admin),
      userName: seededUser.userName,
      displayName: 'End-to-end User',
      role: 'user',
      password: seededUser.password,
      mustChangePassword: false,
      ip: 'e2e-seed',
    });
    if (!created.ok) throw new Error(`The seeded user was refused (${created.error}).`);
  } finally {
    await pool.end();
  }
}
