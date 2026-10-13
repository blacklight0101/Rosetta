import { sessionUserOf, type SessionUser } from '../../domain/accounts/actor.js';
import { recordSuccessfulSignIn } from '../../domain/accounts/sign-in-failures.js';
import { accountState, type UserAccount } from '../../domain/accounts/user.js';
import { parseUserName } from '../../domain/accounts/user-names.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { SessionStore } from '../ports/session-store.js';
import type { UserRepository } from '../ports/user-repository.js';
import { KeyedQueue } from '../support/keyed-queue.js';

// RF-1100, RF-1101, RF-1109, ADR-015: sign-in with a user name and password. Every refusal is the
// same RST-2201 ("User name or password is incorrect"), whether the user is unknown, the password
// wrong, the account locked or disabled. An unknown user name is verified against a dummy hash, so
// every attempt costs one scrypt derivation and takes the same time. A wrong password counts the
// failure with one atomic write of the failure counters only (P1-86), so parallel guesses each
// count and a concurrent disable or reset is never undone; an unknown, disabled or locked name
// makes the same write to an id no account has, so every refusal costs the same database work too.
// The fifth failure within 15 minutes locks the account for 15 minutes (DEC-112). A success
// rotates the session (P1-133: the success write touches the sign-in columns only and only while
// the account is enabled with the verified password, else the sign-in is refused): the previous id is ended and a new one is created. Attempts on one user
// name run one after another, so an attempt after the lock sees it before its password is checked.

export interface SignInRequest {
  readonly userName: string;
  readonly password: string;
  readonly ip: string;
  readonly userAgent: string;
  /** The session id the browser already had; it is ended, never reused (RF-1101). */
  readonly previousSessionId?: string | undefined;
}

export interface SignedIn {
  /** The new session id, for the cookie only. */
  readonly sessionId: string;
  readonly user: SessionUser;
}

export type SignInProblem = typeof ERROR_CODES.invalidCredentials;

export interface SignInDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: SessionStore;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  /** The hash of a password nobody has, verified for unknown user names (equal timing). */
  readonly dummyHash: string;
}

type RefusalReason = 'unknown-user' | 'wrong-password' | 'locked' | 'disabled' | 'account-changed';

interface Refusal {
  readonly request: SignInRequest;
  readonly reason: RefusalReason;
  readonly now: Date;
  readonly account?: UserAccount;
}

/** No account has this id (ids are random version 4 UUIDs), so a write to it changes nothing. */
const NO_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';

const SECURITY_CODES: Readonly<Record<RefusalReason, ErrorCode>> = {
  'unknown-user': ERROR_CODES.invalidCredentials,
  'wrong-password': ERROR_CODES.invalidCredentials,
  locked: ERROR_CODES.accountLocked,
  disabled: ERROR_CODES.invalidCredentials,
  'account-changed': ERROR_CODES.invalidCredentials,
};

export class SignIn {
  private readonly deps: SignInDependencies;
  private readonly attempts = new KeyedQueue();

  constructor(deps: SignInDependencies) {
    this.deps = deps;
  }

  // RF-1100
  execute(request: SignInRequest): Promise<Result<SignedIn, SignInProblem>> {
    const key = request.userName.trim().toLowerCase();
    return this.attempts.run(key, () => this.attempt(request, key));
  }

  private async attempt(
    request: SignInRequest,
    key: string,
  ): Promise<Result<SignedIn, SignInProblem>> {
    const account = await this.find(key);
    const matches = await this.verify(request.password, account);
    const now = this.deps.clock.now();
    if (account === undefined)
      return this.refuseUncounted({ request, reason: 'unknown-user', now });
    const state = accountState(account, now.getTime());
    if (state === 'Disabled') {
      return this.refuseUncounted({ request, reason: 'disabled', now, account });
    }
    if (state === 'Locked')
      return this.refuseUncounted({ request, reason: 'locked', now, account });
    if (!matches) return this.fail(account, request, now);
    return this.succeed(account, request, now);
  }

  private async find(key: string): Promise<UserAccount | undefined> {
    const name = parseUserName(key);
    return name.ok ? this.deps.users.findByUserName(name.value) : undefined;
  }

  /** Always one derivation; an unreadable stored hash counts as a wrong password. */
  private async verify(password: string, account: UserAccount | undefined): Promise<boolean> {
    try {
      return await this.deps.hasher.verify(password, account?.passwordHash ?? this.deps.dummyHash);
    } catch (error) {
      if (!(error instanceof RosettaError) || error.code !== ERROR_CODES.passwordHashInvalid) {
        throw error;
      }
      await this.deps.logger.log({
        level: 'error',
        logger: 'accounts',
        message: 'The stored password hash of an account could not be read.',
        code: ERROR_CODES.passwordHashInvalid,
        ...(account === undefined ? {} : { userId: account.id }),
      });
      return false;
    }
  }

  private async fail(
    account: UserAccount,
    request: SignInRequest,
    now: Date,
  ): Promise<Result<never, SignInProblem>> {
    const locked = await this.deps.users.countFailedSignIn(account.id, now.getTime());
    const refused = await this.refuse({ request, reason: 'wrong-password', now, account });
    if (locked) await this.recordLock(account, request, now);
    return refused;
  }

  /** RF-1100: a refusal that counts no failure still makes the account write `fail` makes. */
  private async refuseUncounted(refusal: Refusal): Promise<Result<never, SignInProblem>> {
    await this.deps.users.countFailedSignIn(NO_ACCOUNT_ID, refusal.now.getTime());
    return this.refuse(refusal);
  }

  private async recordLock(account: UserAccount, request: SignInRequest, now: Date): Promise<void> {
    await this.deps.auditLog.record({
      at: now,
      actorUserId: null,
      action: 'auth.locked',
      targetType: 'user',
      targetId: account.id,
      ip: request.ip,
      outcome: 'refused',
      detail: { failures: 5, lockedMinutes: 15 },
    });
    await this.deps.logger.securityEvent(ERROR_CODES.accountLocked, {
      message: 'Locked an account for 15 minutes after five failed sign-ins.',
      userId: account.id,
      data: { ip: request.ip },
    });
  }

  private async refuse(refusal: Refusal): Promise<Result<never, SignInProblem>> {
    const { request, reason, now, account } = refusal;
    await this.deps.auditLog.record({
      at: now,
      actorUserId: null,
      action: 'auth.sign_in',
      targetType: account === undefined ? null : 'user',
      targetId: account?.id ?? null,
      ip: request.ip,
      outcome: 'refused',
      detail: { reason },
    });
    await this.deps.logger.securityEvent(SECURITY_CODES[reason], {
      message: `Refused a sign-in (${reason}).`,
      ...(account === undefined ? {} : { userId: account.id }),
      data: { ip: request.ip, reason },
    });
    return err(ERROR_CODES.invalidCredentials);
  }

  private async succeed(
    account: UserAccount,
    request: SignInRequest,
    now: Date,
  ): Promise<Result<SignedIn, SignInProblem>> {
    const { users, sessions } = this.deps;
    const signedIn = recordSuccessfulSignIn(account, now.getTime());
    // P1-133: only the sign-in columns, only while enabled with the password that was verified.
    if (!(await users.markSignedIn(account, now.getTime()))) {
      return this.refuse({ request, reason: 'account-changed', now, account });
    }
    if (request.previousSessionId !== undefined) await sessions.end(request.previousSessionId);
    const created = await sessions.create({
      userId: account.id,
      ip: request.ip,
      userAgent: request.userAgent,
      now,
    });
    await this.deps.auditLog.record({
      at: now,
      actorUserId: account.id,
      action: 'auth.sign_in',
      targetType: 'user',
      targetId: account.id,
      ip: request.ip,
      outcome: 'ok',
      detail: {},
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'Signed in.',
      userId: account.id,
    });
    return ok({ sessionId: created.id, user: sessionUserOf(signedIn) });
  }
}
