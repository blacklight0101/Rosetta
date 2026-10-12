import type { Result } from '../errors/result.js';
import { err, ok } from '../errors/result.js';
import type { AccountState, StoredAccountState } from './account-state.js';
import type { Role } from './role.js';
import {
  parseDisplayName,
  parseUserName,
  type DisplayNameProblem,
  type UserNameProblem,
} from './user-names.js';

// Architecture section 5, `User` aggregate (RF-1100..RF-1103, data-model.md section 4). Instants
// are epoch milliseconds (UTC) taken from the Clock port, so the domain can compute the lock
// without creating dates itself.

/** An instant as milliseconds since 1970-01-01T00:00:00Z. */
export type EpochMs = number;

/** An account as lists and pages see it: everything except the password hash. */
export interface User {
  readonly id: string;
  /** Lower case, unique case-insensitively. */
  readonly userName: string;
  readonly displayName: string;
  readonly role: Role;
  readonly state: StoredAccountState;
  readonly failedSignIns: number;
  /** Start of the current failure window (DEC-112); null when there is none. */
  readonly firstFailedAt: EpochMs | null;
  readonly lockedUntil: EpochMs | null;
  readonly serverKeysAllowed: boolean;
  /** Daily cap on server keys in micro-USD; null = the server default (RF-1106). */
  readonly dailyCapMicros: bigint | null;
  /** The user's own daily cap for their keys in micro-USD; null = none (DEC-107). */
  readonly ownDailyCapMicros: bigint | null;
  readonly createdAt: EpochMs;
  readonly updatedAt: EpochMs;
  readonly lastSignInAt: EpochMs | null;
}

/** The account with its password hash, for sign-in and password changes only. */
export interface UserAccount extends User {
  /** `scrypt$N$r$p$salt$hash`; never selected by list queries. */
  readonly passwordHash: string;
}

export interface NewAccount {
  readonly id: string;
  readonly userName: string;
  readonly displayName: string;
  readonly role: Role;
  readonly passwordHash: string;
  /** True: the password must be changed at first sign-in (RF-1102); false for RF-1107. */
  readonly mustChangePassword: boolean;
  readonly now: EpochMs;
}

export type NewAccountProblem = UserNameProblem | DisplayNameProblem;

/** A new account with clear counters, or the first invalid name. */
// RF-1102
export function createAccount(input: NewAccount): Result<UserAccount, NewAccountProblem> {
  const userName = parseUserName(input.userName);
  if (!userName.ok) return userName;
  const displayName = parseDisplayName(input.displayName);
  if (!displayName.ok) return err(displayName.error);
  return ok({
    id: input.id,
    userName: userName.value,
    displayName: displayName.value,
    role: input.role,
    state: input.mustChangePassword ? 'MustChangePassword' : 'Active',
    passwordHash: input.passwordHash,
    failedSignIns: 0,
    firstFailedAt: null,
    lockedUntil: null,
    serverKeysAllowed: true,
    dailyCapMicros: null,
    ownDailyCapMicros: null,
    createdAt: input.now,
    updatedAt: input.now,
    lastSignInAt: null,
  });
}

/** The state at `now`: Disabled wins, then Locked while `lockedUntil` lies ahead. */
// RF-1100
export function accountState(user: User, now: EpochMs): AccountState {
  if (user.state === 'Disabled') return 'Disabled';
  if (user.lockedUntil !== null && now < user.lockedUntil) return 'Locked';
  return user.state;
}
