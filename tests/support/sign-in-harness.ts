import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import { SignIn } from '../../src/application/use-cases/sign-in.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakePasswordHasher, fixturePassword, sampleAccount } from './account-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { RecordingLogger } from './recording-logger.js';
import { sequenceSessionIds } from './session-fixtures.js';

// RF-1100: SignIn with memory adapters, a counting fake hasher, a fixed clock and an unmasked
// recording logger, for the unit tests of sign-in. The account `amy` exists with a fixture password.

/** Counts verifications and the hashes they were asked to check. */
class CountingHasher implements PasswordHasher {
  readonly verified: string[] = [];
  private readonly inner = new FakePasswordHasher();

  hash(password: string): Promise<string> {
    return this.inner.hash(password);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    this.verified.push(passwordHash);
    return this.inner.verify(password, passwordHash);
  }
}

export const dummyHash = 'fake$dummy-hash';
export const request = { ip: '203.0.113.7', userAgent: 'Browser/1.0' };

export interface SignInHarness {
  readonly users: MemoryUserRepository;
  readonly sessions: MemorySessionStore;
  readonly auditLog: MemoryAuditLog;
  readonly logger: RecordingLogger;
  readonly clock: FixedClock;
  readonly hasher: CountingHasher;
  readonly password: string;
  readonly account: UserAccount;
  readonly signIn: SignIn;
}

export async function signInHarness(overrides: Partial<UserAccount> = {}): Promise<SignInHarness> {
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionStore({ newId: sequenceSessionIds() });
  const auditLog = new MemoryAuditLog(new SecretMasker());
  const logger = new RecordingLogger();
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  const hasher = new CountingHasher();
  const password = fixturePassword('Amy');
  const account = sampleAccount({
    userName: 'amy',
    passwordHash: await hasher.hash(password),
    ...overrides,
  });
  await users.insert(account);
  const signIn = new SignIn({ users, hasher, sessions, auditLog, logger, clock, dummyHash });
  return { users, sessions, auditLog, logger, clock, hasher, password, account, signIn };
}
