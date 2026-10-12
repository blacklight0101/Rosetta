import { ERROR_CODES } from '../errors/codes.js';
import { err, ok, type Result } from '../errors/result.js';
import type { EpochMs, UserAccount } from './user.js';

// Architecture section 5, AccountState transitions: MustChangePassword -> Active when the user
// changes the password (RF-1103); any -> Disabled by an administrator; Disabled -> Active when
// enabled; a reset sets MustChangePassword (RF-1102). A Disabled account changes only by enabling.

export type TransitionProblem = typeof ERROR_CODES.accountStateInvalid;

/** The new password hash; the account becomes Active. Refused for a Disabled account. */
// RF-1103
export function changePassword(
  account: UserAccount,
  passwordHash: string,
  now: EpochMs,
): Result<UserAccount, TransitionProblem> {
  if (account.state === 'Disabled') return err(ERROR_CODES.accountStateInvalid);
  return ok({ ...account, state: 'Active', passwordHash, updatedAt: now });
}

/** An administrator's reset: the new hash, and the password must be changed at next sign-in. */
// RF-1102
export function resetPassword(
  account: UserAccount,
  passwordHash: string,
  now: EpochMs,
): Result<UserAccount, TransitionProblem> {
  if (account.state === 'Disabled') return err(ERROR_CODES.accountStateInvalid);
  return ok({ ...account, state: 'MustChangePassword', passwordHash, updatedAt: now });
}

/** Any state becomes Disabled. */
// RF-1102
export function disableAccount(account: UserAccount, now: EpochMs): UserAccount {
  return { ...account, state: 'Disabled', updatedAt: now };
}

/** A Disabled account becomes Active with clear failure counters; any other state is refused. */
// RF-1102
export function enableAccount(
  account: UserAccount,
  now: EpochMs,
): Result<UserAccount, TransitionProblem> {
  if (account.state !== 'Disabled') return err(ERROR_CODES.accountStateInvalid);
  return ok({
    ...account,
    state: 'Active',
    failedSignIns: 0,
    firstFailedAt: null,
    lockedUntil: null,
    updatedAt: now,
  });
}
