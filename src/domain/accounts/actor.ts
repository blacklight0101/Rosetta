import type { StoredAccountState } from './account-state.js';
import type { Role } from './role.js';
import type { User } from './user.js';

// Architecture section 6, RF-1105: every use case receives the signed-in actor (user id and role)
// and scopes every read and write by it. The session API shows the signed-in user without any hash
// or counter (RF-1009).

export interface Actor {
  readonly userId: string;
  readonly role: Role;
}

/** What `GET /api/session` and the sign-in answer show of the signed-in user. */
export interface SessionUser {
  readonly id: string;
  readonly userName: string;
  readonly displayName: string;
  readonly role: Role;
  /** `MustChangePassword` sends the page to the change-password form (RF-1102, P1-10). */
  readonly state: StoredAccountState;
}

// RF-1105
export function actorOf(user: User): Actor {
  return { userId: user.id, role: user.role };
}

// RF-1100, RF-1009
export function sessionUserOf(user: User): SessionUser {
  return {
    id: user.id,
    userName: user.userName,
    displayName: user.displayName,
    role: user.role,
    state: user.state,
  };
}
