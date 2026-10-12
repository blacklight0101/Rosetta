import type { User, UserAccount } from '../../domain/accounts/user.js';
import type { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';

// Architecture section 7, RF-1100..RF-1103: accounts, roles, state and lockout counters. User names
// are unique case-insensitively; list queries never select the password hash (data-model.md
// section 4). Accounts are disabled, never deleted (section 9).

export type InsertUserProblem = typeof ERROR_CODES.userNameTaken;

export interface UserRepository {
  /** Stores a new account; RST-2205 when the user name is taken in any case. */
  insert(account: UserAccount): Promise<Result<UserAccount, InsertUserProblem>>;
  /** Stores the account only when the table has no account yet; true when it was stored. */
  insertIfNoUsers(account: UserAccount): Promise<boolean>;
  hasUsers(): Promise<boolean>;
  findById(id: string): Promise<UserAccount | undefined>;
  /** Case-insensitive. */
  findByUserName(userName: string): Promise<UserAccount | undefined>;
  /** Every account by user name, without the password hash. */
  list(): Promise<readonly User[]>;
  /** Saves everything but the id, user name and creation time; false for an unknown id. */
  update(account: UserAccount): Promise<boolean>;
}
