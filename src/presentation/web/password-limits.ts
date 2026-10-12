// RF-1100, RF-1103, RF-1102: the caps of every route that takes a password (sign-in, change
// password, create user, reset password). The P1-08 hasher has no length limit and queues hashes,
// so the body and the password are capped before anything is hashed; the routes that verify a
// password also allow 10 attempts per minute per address.

/** The largest body of a request that carries a password. */
export const PASSWORD_BODY_LIMIT_BYTES = 4096;

/** The longest password accepted, in characters. */
export const MAX_PASSWORD_LENGTH = 1024;

/** Attempts per minute per address on the routes that verify a password (RF-1100). */
export const PASSWORD_RATE = { max: 10, timeWindow: 60_000 } as const;
