// RF-1105, RF-1009, RF-1102: the columns of the access matrix (tests/integration/access-matrix.test.ts)
// and the expected statuses of the usual kinds of route, so the matrix itself stays a table.

export type Column = 'anonymous' | 'user' | 'otherUser' | 'admin' | 'mustChange';

/** Anonymous, a user, another user, an administrator, an administrator in MustChangePassword. */
export const columns = ['anonymous', 'user', 'otherUser', 'admin', 'mustChange'] as const;

type Statuses = Record<Column, number>;

/** A public route: the same answer for everyone. */
export const everyone = (status: number): Statuses => ({
  anonymous: status,
  user: status,
  otherUser: status,
  admin: status,
  mustChange: status,
});

/** A route every signed-in user reaches, also while the password must be changed. */
export const signedIn = (anonymous: number, status: number): Statuses => ({
  ...everyone(status),
  anonymous,
});

/**
 * A route every signed-in user reaches once the password no longer must be changed; before that a
 * page redirects to the change-password page and anything else answers 403 (RF-1102).
 */
export const active = (anonymous: number, status: number): Statuses => ({
  ...signedIn(anonymous, status),
  mustChange: anonymous === 302 ? 302 : 403,
});

/** A project of the "user" column: it answers its owner, and 404 to every other signed-in user. */
export const ownerOnly = (status: number): Statuses => ({
  anonymous: 401,
  user: status,
  otherUser: 404,
  admin: 404,
  mustChange: 403,
});

/** An administrator route: a `user` gets 403 (RF-1102). */
export const adminOnly = (admin: number): Statuses => ({
  anonymous: 401,
  user: 403,
  otherUser: 403,
  admin,
  mustChange: 403,
});
