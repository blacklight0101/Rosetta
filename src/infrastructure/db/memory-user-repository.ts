import type { InsertUserProblem, UserRepository } from '../../application/ports/user-repository.js';
import {
  recordFailedSignIn,
  recordSuccessfulSignIn,
} from '../../domain/accounts/sign-in-failures.js';
import type { EpochMs, User, UserAccount } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// Architecture section 7, RF-1100..RF-1103: accounts in memory, for unit tests. Passes the same
// contract suite as PgUserRepository: user names unique case-insensitively, lists without the
// password hash, ordered by user name in code-unit order. A failure count is one synchronous step,
// so it is atomic like the guarded UPDATE of the PostgreSQL adapter.

/** The account without its password hash. */
function withoutHash(account: UserAccount): User {
  return {
    id: account.id,
    userName: account.userName,
    displayName: account.displayName,
    role: account.role,
    state: account.state,
    failedSignIns: account.failedSignIns,
    firstFailedAt: account.firstFailedAt,
    lockedUntil: account.lockedUntil,
    serverKeysAllowed: account.serverKeysAllowed,
    dailyCapMicros: account.dailyCapMicros,
    ownDailyCapMicros: account.ownDailyCapMicros,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastSignInAt: account.lastSignInAt,
  };
}

function byUserName(left: User, right: User): number {
  if (left.userName === right.userName) return 0;
  return left.userName < right.userName ? -1 : 1;
}

export class MemoryUserRepository implements UserRepository {
  private readonly accounts = new Map<string, UserAccount>();

  insert(account: UserAccount): Promise<Result<UserAccount, InsertUserProblem>> {
    if (this.named(account.userName) !== undefined) {
      return Promise.resolve(err(ERROR_CODES.userNameTaken));
    }
    this.accounts.set(account.id, account);
    return Promise.resolve(ok(account));
  }

  insertIfNoUsers(account: UserAccount): Promise<boolean> {
    if (this.accounts.size > 0) return Promise.resolve(false);
    this.accounts.set(account.id, account);
    return Promise.resolve(true);
  }

  hasUsers(): Promise<boolean> {
    return Promise.resolve(this.accounts.size > 0);
  }

  findById(id: string): Promise<UserAccount | undefined> {
    return Promise.resolve(this.accounts.get(id));
  }

  findByUserName(userName: string): Promise<UserAccount | undefined> {
    return Promise.resolve(this.named(userName));
  }

  list(): Promise<readonly User[]> {
    return Promise.resolve([...this.accounts.values()].map(withoutHash).sort(byUserName));
  }

  update(account: UserAccount): Promise<boolean> {
    const stored = this.accounts.get(account.id);
    if (stored === undefined) return Promise.resolve(false);
    this.accounts.set(account.id, {
      ...account,
      userName: stored.userName,
      createdAt: stored.createdAt,
    });
    return Promise.resolve(true);
  }

  updateIfCurrent(
    account: UserAccount,
    read: Pick<UserAccount, 'state' | 'updatedAt' | 'passwordHash'>,
  ): Promise<boolean> {
    const stored = this.accounts.get(account.id);
    const current =
      stored?.state === read.state &&
      stored.updatedAt === read.updatedAt &&
      stored.passwordHash === read.passwordHash;
    return current ? this.update(account) : Promise.resolve(false);
  }

  markSignedIn(read: UserAccount, now: EpochMs): Promise<boolean> {
    const stored = this.accounts.get(read.id);
    if (stored === undefined) return Promise.resolve(false);
    if (stored.state === 'Disabled' || stored.passwordHash !== read.passwordHash) {
      return Promise.resolve(false);
    }
    const { failedSignIns, firstFailedAt, lockedUntil, lastSignInAt } = recordSuccessfulSignIn(
      stored,
      now,
    );
    this.accounts.set(read.id, {
      ...stored,
      failedSignIns,
      firstFailedAt,
      lockedUntil,
      lastSignInAt,
    });
    return Promise.resolve(true);
  }

  countFailedSignIn(id: string, now: EpochMs): Promise<boolean> {
    const stored = this.accounts.get(id);
    if (stored === undefined) return Promise.resolve(false);
    const { account: counted, locked } = recordFailedSignIn(stored, now);
    this.accounts.set(id, {
      ...stored,
      failedSignIns: counted.failedSignIns,
      firstFailedAt: counted.firstFailedAt,
      lockedUntil: counted.lockedUntil,
    });
    return Promise.resolve(locked);
  }

  private named(userName: string): UserAccount | undefined {
    const wanted = userName.toLowerCase();
    return [...this.accounts.values()].find((account) => account.userName.toLowerCase() === wanted);
  }
}
