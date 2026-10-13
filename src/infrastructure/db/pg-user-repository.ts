import { z } from 'zod';
import type { InsertUserProblem, UserRepository } from '../../application/ports/user-repository.js';
import { SIGN_IN_FAILURE_LIMITS } from '../../domain/accounts/sign-in-failures.js';
import type { EpochMs, User, UserAccount } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabaseClient, DatabasePool } from './pool.js';
import { insertValues, toUser, toUserAccount, updateValues, USER_COLUMNS } from './user-rows.js';

// Architecture section 7, ADR-016, RF-1100..RF-1103: accounts in PostgreSQL with parameterised SQL
// only. The unique index on lower(user_name) makes names unique case-insensitively; the list query
// never selects password_hash. A database failure is thrown as RST-2404 with the cause.
// P1-77, RNF-003: the cause keeps only the SQLSTATE and the message, with the hash masked;
// PostgreSQL quotes the failing row (password_hash included) in the detail, which is dropped.

const INSERT_COLUMNS =
  'id, user_name, display_name, role, state, password_hash, failed_sign_ins, first_failed_at, locked_until, server_keys_allowed, daily_cap_micros, own_daily_cap_micros, created_at, updated_at, last_sign_in_at';
const INSERT =
  'INSERT INTO users (' +
  INSERT_COLUMNS +
  ') VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)';
// The first account: the advisory lock serialises two starts, NOT EXISTS keeps the table's first.
const BOOTSTRAP_LOCK = "SELECT pg_advisory_xact_lock(hashtext('rosetta.bootstrap-admin'))";
const INSERT_IF_EMPTY =
  'INSERT INTO users (' +
  INSERT_COLUMNS +
  ') SELECT $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::int, $8::timestamptz, $9::timestamptz, $10::boolean, $11::bigint, $12::bigint, $13::timestamptz, $14::timestamptz, $15::timestamptz WHERE NOT EXISTS (SELECT 1 FROM users)';
const HAS_USERS = 'SELECT EXISTS (SELECT 1 FROM users) AS found';
const SELECT_ACCOUNT = 'SELECT ' + USER_COLUMNS + ', password_hash FROM users';
const FIND_BY_ID = SELECT_ACCOUNT + ' WHERE id = $1';
const FIND_BY_USER_NAME = SELECT_ACCOUNT + ' WHERE lower(user_name) = lower($1)';
const LIST = 'SELECT ' + USER_COLUMNS + ' FROM users ORDER BY user_name COLLATE "C"';
const UPDATE =
  'UPDATE users SET display_name = $2, role = $3, state = $4, password_hash = $5, failed_sign_ins = $6, first_failed_at = $7, locked_until = $8, server_keys_allowed = $9, daily_cap_micros = $10, own_daily_cap_micros = $11, updated_at = $12, last_sign_in_at = $13 WHERE id = $1';

const UPDATE_IF_CURRENT = UPDATE + ' AND state = $14 AND updated_at = $15 AND password_hash = $16';
// P1-86, DEC-112: `recordFailedSignIn` in one statement. $2 is now, $3 the start of the window
// (now - 15 minutes), $4 the failure limit, $5 the end of a new lock. The SET expressions read the
// row as it is when the write takes its row lock, so parallel failures each count; only the
// counters are written, so a concurrent disable or reset stays; a locked account is not matched.
const OPEN_WINDOW = 'first_failed_at > $3::timestamptz';
const FAILURES = 'CASE WHEN ' + OPEN_WINDOW + ' THEN failed_sign_ins + 1 ELSE 1 END';
const COUNT_FAILED_SIGN_IN =
  'UPDATE users SET failed_sign_ins = ' +
  FAILURES +
  ', first_failed_at = CASE WHEN ' +
  OPEN_WINDOW +
  ' THEN first_failed_at ELSE $2::timestamptz END, locked_until = CASE WHEN ' +
  FAILURES +
  ' >= $4::int THEN $5::timestamptz ELSE locked_until END' +
  ' WHERE id = $1 AND (locked_until IS NULL OR locked_until <= $2::timestamptz)' +
  ' RETURNING failed_sign_ins';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';
const foundRow = z.object({ found: z.boolean() });
const countedRow = z.object({ failed_sign_ins: z.number().int() });

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION;
}

/** A database failure as the cause of RST-2404, without the row data PostgreSQL attaches. */
class DatabaseFailure extends Error {
  readonly sqlState: string | undefined;

  constructor(message: string, sqlState: string | undefined) {
    super(message);
    this.name = 'DatabaseFailure';
    this.sqlState = sqlState;
  }
}

function sqlStateOf(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function queryFailed(error: unknown, passwordHash?: string): RosettaError {
  const message = error instanceof Error ? error.message : 'The database query failed';
  const masked =
    passwordHash === undefined || passwordHash === ''
      ? message
      : message.replaceAll(passwordHash, '[MASKED:password]');
  const cause = new DatabaseFailure(masked, sqlStateOf(error));
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause });
}

export class PgUserRepository implements UserRepository {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async insert(account: UserAccount): Promise<Result<UserAccount, InsertUserProblem>> {
    try {
      await this.pool.query(INSERT, insertValues(account));
      return ok(account);
    } catch (error) {
      if (isUniqueViolation(error)) return err(ERROR_CODES.userNameTaken);
      throw queryFailed(error, account.passwordHash);
    }
  }

  async insertIfNoUsers(account: UserAccount): Promise<boolean> {
    const client = await this.connect();
    try {
      await client.query('BEGIN');
      await client.query(BOOTSTRAP_LOCK);
      const result = await client.query(INSERT_IF_EMPTY, insertValues(account));
      await client.query('COMMIT');
      return result.rowCount === 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw queryFailed(error, account.passwordHash);
    } finally {
      client.release();
    }
  }

  async hasUsers(): Promise<boolean> {
    const [row] = await this.rows(HAS_USERS, []);
    return foundRow.parse(row).found;
  }

  async findById(id: string): Promise<UserAccount | undefined> {
    // Not a UUID cannot name an account; asking PostgreSQL would fail on the uuid cast.
    if (!UUID.test(id)) return undefined;
    const [row] = await this.rows(FIND_BY_ID, [id]);
    return row === undefined ? undefined : toUserAccount(row);
  }

  async findByUserName(userName: string): Promise<UserAccount | undefined> {
    const [row] = await this.rows(FIND_BY_USER_NAME, [userName]);
    return row === undefined ? undefined : toUserAccount(row);
  }

  async list(): Promise<readonly User[]> {
    return (await this.rows(LIST, [])).map(toUser);
  }

  async update(account: UserAccount): Promise<boolean> {
    if (!UUID.test(account.id)) return false;
    try {
      const result = await this.pool.query(UPDATE, updateValues(account));
      return result.rowCount === 1;
    } catch (error) {
      throw queryFailed(error, account.passwordHash);
    }
  }

  async updateIfCurrent(
    account: UserAccount,
    read: Pick<UserAccount, 'state' | 'updatedAt' | 'passwordHash'>,
  ): Promise<boolean> {
    if (!UUID.test(account.id)) return false;
    const values = [
      ...updateValues(account),
      read.state,
      new Date(read.updatedAt),
      read.passwordHash,
    ];
    try {
      const result = await this.pool.query(UPDATE_IF_CURRENT, values);
      return result.rowCount === 1;
    } catch (error) {
      throw queryFailed(error, account.passwordHash);
    }
  }

  async countFailedSignIn(id: string, now: EpochMs): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const { maxFailures, windowMs, lockMs } = SIGN_IN_FAILURE_LIMITS;
    const values = [
      id,
      new Date(now),
      new Date(now - windowMs),
      maxFailures,
      new Date(now + lockMs),
    ];
    const [row] = await this.rows(COUNT_FAILED_SIGN_IN, values);
    // Only an account that was not locked is written, so reaching the limit is this lock.
    return row !== undefined && countedRow.parse(row).failed_sign_ins >= maxFailures;
  }

  markSignedIn(_read: UserAccount, _now: EpochMs): Promise<boolean> {
    return Promise.resolve(false);
  }

  private async rows(sql: string, values: unknown[]): Promise<unknown[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(sql, values);
      return result.rows;
    } catch (error) {
      throw queryFailed(error);
    }
  }

  private async connect(): Promise<DatabaseClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw queryFailed(error);
    }
  }
}
