import type { Actor } from '../../domain/accounts/actor.js';
import {
  checkNewPassword,
  type CommonPasswordList,
  type PasswordProblem,
} from '../../domain/accounts/password-rules.js';
import type { Role } from '../../domain/accounts/role.js';
import { createAccount, type NewAccountProblem } from '../../domain/accounts/user.js';
import { parseUserName } from '../../domain/accounts/user-names.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { summaryOf, type AccountSummary } from '../accounts/account-summary.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Logger } from '../ports/logger.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { InsertUserProblem, UserRepository } from '../ports/user-repository.js';

// RF-1102, RF-1107, RF-1109: an administrator creates an account with a user name, a display name,
// a role and an initial password that meets the RF-1103 rules. By default the password must be
// changed at first sign-in; the teacher account is created without that (RF-1107). There is no
// self sign-up: only an administrator reaches this use case. The creation is audited with the role
// and the flag, never the password.

export interface CreateUserRequest {
  readonly actor: Actor;
  readonly userName: string;
  readonly displayName: string;
  readonly role: Role;
  readonly password: string;
  /** Default true (RF-1102); false for the teacher account (RF-1107). */
  readonly mustChangePassword?: boolean | undefined;
  readonly ip: string;
}

export type CreateUserProblem =
  typeof ERROR_CODES.notAllowed | NewAccountProblem | PasswordProblem | InsertUserProblem;

export interface CreateUserDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly commonPasswords: CommonPasswordList;
}

export class CreateUser {
  private readonly deps: CreateUserDependencies;

  constructor(deps: CreateUserDependencies) {
    this.deps = deps;
  }

  // RF-1102
  async execute(request: CreateUserRequest): Promise<Result<AccountSummary, CreateUserProblem>> {
    const { users, hasher, clock, ids } = this.deps;
    if (request.actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
    const name = parseUserName(request.userName);
    if (!name.ok) return name;
    const now = clock.now();
    const mustChangePassword = request.mustChangePassword ?? true;
    const draft = createAccount({
      ...{ id: ids.uuid(), userName: name.value, displayName: request.displayName },
      ...{ role: request.role, passwordHash: '', mustChangePassword, now: now.getTime() },
    });
    if (!draft.ok) return draft;
    const rules = checkNewPassword(request.password, name.value, this.deps.commonPasswords);
    if (!rules.ok) return err(rules.error);
    const account = { ...draft.value, passwordHash: await hasher.hash(rules.value) };
    const inserted = await users.insert(account);
    if (!inserted.ok) return inserted;
    await this.deps.auditLog.record({
      at: now,
      actorUserId: request.actor.userId,
      action: 'user.created',
      targetType: 'user',
      targetId: account.id,
      ip: request.ip,
      outcome: 'ok',
      detail: { role: account.role, changeAtFirstSignIn: mustChangePassword },
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'An administrator created an account.',
      userId: request.actor.userId,
      data: { createdUserId: account.id, role: account.role },
    });
    return ok(summaryOf(account, now.getTime()));
  }
}
