import type { AccountState } from '../../domain/accounts/account-state.js';
import type { Role } from '../../domain/accounts/role.js';
import { accountState, type EpochMs, type User } from '../../domain/accounts/user.js';

// RF-1102: what the administration answers show of an account. Never the password hash or the
// lockout counters; the state is the one at `now`, so a locked account reads `Locked`.

export interface AccountSummary {
  readonly id: string;
  readonly userName: string;
  readonly displayName: string;
  readonly role: Role;
  readonly state: AccountState;
  readonly createdAt: EpochMs;
  readonly lastSignInAt: EpochMs | null;
}

// RF-1102
export function summaryOf(user: User, now: EpochMs): AccountSummary {
  return {
    id: user.id,
    userName: user.userName,
    displayName: user.displayName,
    role: user.role,
    state: accountState(user, now),
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
  };
}
