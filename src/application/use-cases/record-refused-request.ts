import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';

// RF-1009, RF-1109, RF-009: a request refused for its `Origin`, its CSRF token, the role of its
// user or a password that must be changed first (RF-1102) is answered 403, and one refused by a
// rate limit or the in-flight bound of the password routes (RF-1100) 429; each writes a
// `request.refused` audit row and a `warn` security event with the refusal's code. Every refusal
// keeps its row (DEC-124). The path is kept without its query string.

export type RefusalReason = 'origin' | 'csrf' | 'role' | 'password-change' | 'rate-limit';

export interface RefusedRequest {
  /** Null when nobody is signed in. */
  readonly actor: Actor | null;
  readonly reason: RefusalReason;
  readonly method: string;
  readonly path: string;
  readonly ip: string;
}

export interface RecordRefusedRequestDependencies {
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

const CODES: Readonly<Record<RefusalReason, ErrorCode>> = {
  origin: ERROR_CODES.originRefused,
  csrf: ERROR_CODES.csrfTokenInvalid,
  role: ERROR_CODES.notAllowed,
  'password-change': ERROR_CODES.passwordChangeRequired,
  'rate-limit': ERROR_CODES.rateLimited,
};

export class RecordRefusedRequest {
  private readonly deps: RecordRefusedRequestDependencies;

  constructor(deps: RecordRefusedRequestDependencies) {
    this.deps = deps;
  }

  // RF-1009, RF-1109
  async execute(refused: RefusedRequest): Promise<void> {
    const { actor, reason, method, path, ip } = refused;
    await this.deps.auditLog.record({
      at: this.deps.clock.now(),
      actorUserId: actor?.userId ?? null,
      action: 'request.refused',
      targetType: 'route',
      targetId: `${method} ${path}`,
      ip,
      outcome: 'refused',
      detail: { reason },
    });
    await this.deps.logger.securityEvent(CODES[reason], {
      message: `Refused a request (${reason}): ${method} ${path}`,
      ...(actor === null ? {} : { userId: actor.userId }),
      data: { reason, method, path, ip },
    });
  }
}
