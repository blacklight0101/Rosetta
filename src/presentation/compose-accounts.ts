import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { PasswordHasher } from '../application/ports/password-hasher.js';
import type { SessionStore } from '../application/ports/session-store.js';
import { BootstrapAdmin } from '../application/use-cases/bootstrap-admin.js';
import { ChangePassword } from '../application/use-cases/change-password.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import { ListAudit } from '../application/use-cases/list-audit.js';
import { ListUsers } from '../application/use-cases/list-users.js';
import { ResetPassword } from '../application/use-cases/reset-password.js';
import { UpdateUser } from '../application/use-cases/update-user.js';
import { RecordRefusedRequest } from '../application/use-cases/record-refused-request.js';
import { ResolveSession } from '../application/use-cases/resolve-session.js';
import { SignIn } from '../application/use-cases/sign-in.js';
import { SignOut } from '../application/use-cases/sign-out.js';
import { ERROR_CODES } from '../domain/errors/codes.js';
import { describeError } from '../domain/errors/descriptions.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { PgAccountUsage } from '../infrastructure/db/pg-account-usage.js';
import { PgAuditLog } from '../infrastructure/db/pg-audit-log.js';
import { PgSessionStore } from '../infrastructure/db/pg-session-store.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../infrastructure/security/common-passwords.js';
import { createDummyHash } from '../infrastructure/security/dummy-password-hash.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { AccountServices, AuthServices } from './web/server.js';

// Architecture section 2 (composition root), RF-1102, RF-1100, RF-1101: the account adapters, the
// start-up step that creates the bootstrap administrator and the use cases behind the session API.
// One password hasher serves both, so at most two scrypt derivations run at a time (DEC-112). A
// refused bootstrap stops the start-up with the rule's RST code; the error names the variable,
// never its value.

export interface AccountParts {
  readonly environment: Pick<Environment, 'adminUser' | 'adminPassword'>;
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  readonly hasher: PasswordHasher;
}

// RF-1102
export async function bootstrapAdministrator(parts: AccountParts): Promise<void> {
  const { environment, pool, logger, clock, masker, hasher } = parts;
  const bootstrap = new BootstrapAdmin({
    users: new PgUserRepository(pool),
    hasher,
    auditLog: new PgAuditLog(pool, masker),
    logger,
    clock,
    ids: new TimestampIdGenerator(clock),
    commonPasswords: await loadCommonPasswords(commonPasswordsFile),
  });
  const outcome = await bootstrap.execute({
    userName: environment.adminUser,
    password: environment.adminPassword,
  });
  if (!outcome.ok) {
    const variable =
      outcome.error === ERROR_CODES.userNameInvalid
        ? 'ROSETTA_ADMIN_USER'
        : 'ROSETTA_ADMIN_PASSWORD';
    throw new RosettaError(
      outcome.error,
      `${variable} was refused, so no administrator was created: ${describeError(outcome.error).message}`,
    );
  }
}

export interface Auth {
  readonly services: AuthServices;
  /** For the hourly purge of expired sessions (architecture section 7, `Scheduler`). */
  readonly sessions: SessionStore;
}

interface AccountAdapters {
  readonly pool: DatabasePool;
  readonly users: PgUserRepository;
  readonly sessions: PgSessionStore;
  readonly auditLog: PgAuditLog;
  readonly hasher: PasswordHasher;
  readonly logger: Logger;
  readonly clock: Clock;
}

// RF-1102, RF-1103, RF-1109: the account and administration use cases. They share the one hasher.
async function composeAccounts(adapters: AccountAdapters): Promise<AccountServices> {
  const { pool, users, sessions, auditLog, hasher, logger, clock } = adapters;
  const commonPasswords = await loadCommonPasswords(commonPasswordsFile);
  const base = { users, auditLog, logger, clock };
  return {
    changePassword: new ChangePassword({ ...base, hasher, sessions, commonPasswords }),
    createUser: new CreateUser({
      ...base,
      hasher,
      ids: new TimestampIdGenerator(clock),
      commonPasswords,
    }),
    updateUser: new UpdateUser({ ...base, sessions }),
    resetPassword: new ResetPassword({ ...base, hasher, sessions, commonPasswords }),
    listUsers: new ListUsers({ users, usage: new PgAccountUsage(pool), clock }),
    listAudit: new ListAudit({ auditLog, clock }),
  };
}

// RF-1009, RF-1100, RF-1101
export async function composeAuth(parts: Omit<AccountParts, 'environment'>): Promise<Auth> {
  const { pool, logger, clock, masker, hasher } = parts;
  const users = new PgUserRepository(pool);
  const sessions = new PgSessionStore(pool);
  const auditLog = new PgAuditLog(pool, masker);
  const dummyHash = await createDummyHash(hasher);
  return {
    sessions,
    services: {
      accounts: await composeAccounts({ pool, users, sessions, auditLog, hasher, logger, clock }),
      signIn: new SignIn({ users, hasher, sessions, auditLog, logger, clock, dummyHash }),
      signOut: new SignOut({ sessions, auditLog, logger, clock }),
      resolveSession: new ResolveSession({ sessions, users, logger, clock }),
      refusals: new RecordRefusedRequest({ auditLog, logger, clock }),
    },
  };
}
