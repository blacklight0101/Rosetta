import { ChangePassword } from '../../src/application/use-cases/change-password.js';
import { CreateUser } from '../../src/application/use-cases/create-user.js';
import { ListAudit } from '../../src/application/use-cases/list-audit.js';
import { ListUsers } from '../../src/application/use-cases/list-users.js';
import { ResetPassword } from '../../src/application/use-cases/reset-password.js';
import { UpdateUser } from '../../src/application/use-cases/update-user.js';
import { actorOf, type Actor } from '../../src/domain/accounts/actor.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import {
  commonPasswords,
  FakePasswordHasher,
  fixturePassword,
  sampleAccount,
} from './account-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { RecordingLogger } from './recording-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { sequenceSessionIds } from './session-fixtures.js';

// RF-1102, RF-1103, RF-1109: the account use cases over memory adapters, a fake hasher, a fixed
// clock and an unmasked recording logger. The administrator `root` and the user `amy` exist, each
// with a fixture password.

export const client = { ip: '203.0.113.7', userAgent: 'Browser/1.0' } as const;

export interface AccountAdminHarness {
  readonly users: MemoryUserRepository;
  readonly sessions: MemorySessionStore;
  readonly auditLog: MemoryAuditLog;
  readonly usage: MemoryAccountUsage;
  readonly logger: RecordingLogger;
  readonly clock: FixedClock;
  readonly hasher: FakePasswordHasher;
  readonly admin: {
    readonly account: UserAccount;
    readonly actor: Actor;
    readonly password: string;
  };
  readonly amy: { readonly account: UserAccount; readonly actor: Actor; readonly password: string };
  readonly changePassword: ChangePassword;
  readonly createUser: CreateUser;
  readonly updateUser: UpdateUser;
  readonly resetPassword: ResetPassword;
  readonly listUsers: ListUsers;
  readonly listAudit: ListAudit;
}

async function stored(
  users: MemoryUserRepository,
  hasher: FakePasswordHasher,
  overrides: Partial<UserAccount> & { readonly userName: string },
): Promise<{ account: UserAccount; actor: Actor; password: string }> {
  const password = fixturePassword(overrides.userName.toUpperCase());
  const account = sampleAccount({ ...overrides, passwordHash: await hasher.hash(password) });
  await users.insert(account);
  return { account, actor: actorOf(account), password };
}

export async function accountAdminHarness(): Promise<AccountAdminHarness> {
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionStore({ newId: sequenceSessionIds() });
  const auditLog = new MemoryAuditLog(new SecretMasker());
  const usage = new MemoryAccountUsage();
  const logger = new RecordingLogger();
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const hasher = new FakePasswordHasher();
  const ids = new SequenceIdGenerator();
  const admin = await stored(users, hasher, { userName: 'root', role: 'admin' });
  const amy = await stored(users, hasher, { userName: 'amy' });
  const base = { users, auditLog, logger, clock };
  return {
    ...{ users, sessions, auditLog, usage, logger, clock, hasher, admin, amy },
    changePassword: new ChangePassword({ ...base, hasher, sessions, commonPasswords }),
    createUser: new CreateUser({ ...base, hasher, ids, commonPasswords }),
    updateUser: new UpdateUser({ ...base, sessions }),
    resetPassword: new ResetPassword({ ...base, hasher, sessions, commonPasswords }),
    listUsers: new ListUsers({ users, usage, clock }),
    listAudit: new ListAudit({ auditLog, clock }),
  };
}
