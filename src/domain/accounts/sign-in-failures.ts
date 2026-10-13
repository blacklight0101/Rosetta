import type { EpochMs, UserAccount } from './user.js';

// RF-1100, DEC-112: five failed sign-ins within 15 minutes lock the account for 15 minutes. The
// window starts at `firstFailedAt`; a failure after the window starts a new one. The lock is
// `lockedUntil` (architecture section 5: Active -> Locked, back after 15 minutes).

const MAX_FAILED_SIGN_INS = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const LOCK_DURATION_MS = 15 * 60_000;

/** The lockout rule, for an adapter that applies `recordFailedSignIn` in one database write. */
export const SIGN_IN_FAILURE_LIMITS = {
  maxFailures: MAX_FAILED_SIGN_INS,
  windowMs: FAILURE_WINDOW_MS,
  lockMs: LOCK_DURATION_MS,
} as const;

export interface FailedSignIn {
  readonly account: UserAccount;
  /** True when this failure locked the account (for the audit event `auth.locked`). */
  readonly locked: boolean;
}

/** True while `lockedUntil` lies ahead of `now`. */
// RF-1100
export function isLocked(account: UserAccount, now: EpochMs): boolean {
  return account.lockedUntil !== null && now < account.lockedUntil;
}

/** Counts one failure; the fifth within the window locks. A locked account is left unchanged. */
// RF-1100
export function recordFailedSignIn(account: UserAccount, now: EpochMs): FailedSignIn {
  if (isLocked(account, now)) return { account, locked: false };
  const windowOpen =
    account.firstFailedAt !== null && now - account.firstFailedAt < FAILURE_WINDOW_MS;
  const failedSignIns = windowOpen ? account.failedSignIns + 1 : 1;
  const firstFailedAt = windowOpen ? account.firstFailedAt : now;
  const locked = failedSignIns >= MAX_FAILED_SIGN_INS;
  return {
    account: {
      ...account,
      failedSignIns,
      firstFailedAt,
      lockedUntil: locked ? now + LOCK_DURATION_MS : account.lockedUntil,
    },
    locked,
  };
}

/** A successful sign-in clears the failure counters and the lock and records the time. */
// RF-1100
export function recordSuccessfulSignIn(account: UserAccount, now: EpochMs): UserAccount {
  return {
    ...account,
    failedSignIns: 0,
    firstFailedAt: null,
    lockedUntil: null,
    lastSignInAt: now,
  };
}
