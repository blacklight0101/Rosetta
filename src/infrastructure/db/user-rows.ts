import { z } from 'zod';
import { STORED_ACCOUNT_STATES } from '../../domain/accounts/account-state.js';
import { ROLES } from '../../domain/accounts/role.js';
import type { User, UserAccount } from '../../domain/accounts/user.js';

// Data-model.md section 4, `users`: the columns every account query selects, the row schemas and
// the mapping to the domain. Money columns are read as text and become bigint; times become epoch
// milliseconds. The list columns leave out `password_hash` (RF-1102).

/** Every column except the password hash, in table order. */
export const USER_COLUMNS =
  'id, user_name, display_name, role, state, failed_sign_ins, first_failed_at, locked_until, server_keys_allowed, daily_cap_micros::text AS daily_cap_micros, own_daily_cap_micros::text AS own_daily_cap_micros, created_at, updated_at, last_sign_in_at';

const micros = z
  .string()
  .regex(/^-?\d+$/)
  .transform((text) => BigInt(text))
  .nullable();
const instant = z.date().transform((date) => date.getTime());

const userRowSchema = z.object({
  id: z.string(),
  user_name: z.string(),
  display_name: z.string(),
  role: z.enum(ROLES),
  state: z.enum(STORED_ACCOUNT_STATES),
  failed_sign_ins: z.number().int().nonnegative(),
  first_failed_at: instant.nullable(),
  locked_until: instant.nullable(),
  server_keys_allowed: z.boolean(),
  daily_cap_micros: micros,
  own_daily_cap_micros: micros,
  created_at: instant,
  updated_at: instant,
  last_sign_in_at: instant.nullable(),
});

const accountRowSchema = userRowSchema.extend({ password_hash: z.string() });

type UserRow = z.output<typeof userRowSchema>;

function toUserFields(row: UserRow): User {
  return {
    id: row.id,
    userName: row.user_name,
    displayName: row.display_name,
    role: row.role,
    state: row.state,
    failedSignIns: row.failed_sign_ins,
    firstFailedAt: row.first_failed_at,
    lockedUntil: row.locked_until,
    serverKeysAllowed: row.server_keys_allowed,
    dailyCapMicros: row.daily_cap_micros,
    ownDailyCapMicros: row.own_daily_cap_micros,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSignInAt: row.last_sign_in_at,
  };
}

/** A list row (no hash) as a `User`. */
// RF-1102
export function toUser(row: unknown): User {
  return toUserFields(userRowSchema.parse(row));
}

/** A full row as a `UserAccount`. */
// RF-1100
export function toUserAccount(row: unknown): UserAccount {
  const parsed = accountRowSchema.parse(row);
  return { ...toUserFields(parsed), passwordHash: parsed.password_hash };
}

function dateOrNull(instantMs: number | null): Date | null {
  return instantMs === null ? null : new Date(instantMs);
}

function textOrNull(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

/** The values of the INSERT statements, in the order of their columns. */
// RF-1102
export function insertValues(account: UserAccount): unknown[] {
  return [
    account.id,
    account.userName,
    account.displayName,
    account.role,
    account.state,
    account.passwordHash,
    account.failedSignIns,
    dateOrNull(account.firstFailedAt),
    dateOrNull(account.lockedUntil),
    account.serverKeysAllowed,
    textOrNull(account.dailyCapMicros),
    textOrNull(account.ownDailyCapMicros),
    new Date(account.createdAt),
    new Date(account.updatedAt),
    dateOrNull(account.lastSignInAt),
  ];
}

/** The values of the UPDATE statement: the id, then the changeable columns. */
// RF-1100
export function updateValues(account: UserAccount): unknown[] {
  return [
    account.id,
    account.displayName,
    account.role,
    account.state,
    account.passwordHash,
    account.failedSignIns,
    dateOrNull(account.firstFailedAt),
    dateOrNull(account.lockedUntil),
    account.serverKeysAllowed,
    textOrNull(account.dailyCapMicros),
    textOrNull(account.ownDailyCapMicros),
    new Date(account.updatedAt),
    dateOrNull(account.lastSignInAt),
  ];
}
