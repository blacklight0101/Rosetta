import {
  checkNewPassword,
  type CommonPasswordList,
  type PasswordProblem,
} from '../../domain/accounts/password-rules.js';
import { createAccount, type NewAccountProblem } from '../../domain/accounts/user.js';
import { parseUserName } from '../../domain/accounts/user-names.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Logger } from '../ports/logger.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1102: at the first start of an empty database, the administrator is created once from
// ROSETTA_ADMIN_USER and ROSETTA_ADMIN_PASSWORD, in MustChangePassword. Neither value is ever
// logged or audited. The password must meet the RF-1103 rules: whoever signs in first with it
// owns the administrator account, so a weak one is refused and nothing is created.

export interface BootstrapAdminRequest {
  /** ROSETTA_ADMIN_USER; undefined when not set. */
  readonly userName?: string | undefined;
  /** ROSETTA_ADMIN_PASSWORD; undefined when not set. */
  readonly password?: string | undefined;
}

export type BootstrapAdminOutcome = 'created' | 'accounts-exist' | 'not-configured';

export type BootstrapAdminProblem = NewAccountProblem | PasswordProblem;

export interface BootstrapAdminDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly commonPasswords: CommonPasswordList;
}

const ADMIN_DISPLAY_NAME = 'Administrator';
/** The audit row's address: the account is created by the server itself, not by a request. */
const START_UP_ADDRESS = 'start-up';

export class BootstrapAdmin {
  private readonly deps: BootstrapAdminDependencies;

  constructor(deps: BootstrapAdminDependencies) {
    this.deps = deps;
  }

  // RF-1102
  async execute(
    request: BootstrapAdminRequest,
  ): Promise<Result<BootstrapAdminOutcome, BootstrapAdminProblem>> {
    const { users, logger } = this.deps;
    if (await users.hasUsers()) return ok(await this.skipped());
    const { userName, password } = request;
    if (userName === undefined || password === undefined) {
      await logger.log({
        level: 'warn',
        logger: 'accounts',
        message:
          'No account exists and ROSETTA_ADMIN_USER or ROSETTA_ADMIN_PASSWORD is not set, so nobody can sign in. Set both and restart.',
      });
      return ok('not-configured');
    }
    const name = parseUserName(userName);
    if (!name.ok) return name;
    const rules = checkNewPassword(password, name.value, this.deps.commonPasswords);
    if (!rules.ok) return err(rules.error);
    return this.create(name.value, password);
  }

  private async create(
    userName: string,
    password: string,
  ): Promise<Result<BootstrapAdminOutcome, BootstrapAdminProblem>> {
    const { users, hasher, clock, ids } = this.deps;
    const now = clock.now();
    const account = createAccount({
      id: ids.uuid(),
      userName,
      displayName: ADMIN_DISPLAY_NAME,
      role: 'admin',
      passwordHash: await hasher.hash(password),
      mustChangePassword: true,
      now: now.getTime(),
    });
    if (!account.ok) return account;
    if (!(await users.insertIfNoUsers(account.value))) return ok(await this.skipped());
    await this.deps.auditLog.record({
      at: now,
      actorUserId: null,
      action: 'user.created',
      targetType: 'user',
      targetId: account.value.id,
      ip: START_UP_ADDRESS,
      outcome: 'ok',
      detail: { role: 'admin', source: 'environment' },
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'accounts',
      message:
        'Created the bootstrap administrator account; its password must be changed at the first sign-in.',
      userId: account.value.id,
    });
    return ok('created');
  }

  private async skipped(): Promise<'accounts-exist'> {
    await this.deps.logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'Accounts exist, so no bootstrap administrator was created.',
    });
    return 'accounts-exist';
  }
}
