import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import { RefusalLimiter, type RefusalCount } from '../audit/refusal-limiter.js';

// RF-1009, RF-1109, RF-009: a request refused for its `Origin`, its CSRF token, the role of its
// user or a password that must be changed first (RF-1102) is answered 403, and one refused by a
// rate limit or the in-flight bound of the password routes (RF-1100) 429; each writes a
// `request.refused` audit row and a `warn` security event with the refusal's code. The path is
// kept without its query string.
// DEC-141 (replaces DEC-124 in part, P1-157): every writer goes through `execute`, so one limit per
// client address covers them all: up to 30 rows a minute, then one row with reason `rate-limit` and
// the count of the refusals that wrote nothing, written when that minute has ended (at the next
// refusal, at the one-minute task `flushEnded`, or at shutdown through `flushAll`). The stored path
// (the row's target, the event's message and data) is cut to 512 characters with a marker.

export type RefusalReason = 'origin' | 'csrf' | 'role' | 'password-change' | 'rate-limit';

export interface RefusedRequest {
  /** Null when nobody is signed in. */
  readonly actor: Actor | null;
  readonly reason: RefusalReason;
  readonly method: string;
  readonly path: string;
  /** The address the server already trusts (`request.ip`, ROSETTA_TRUST_PROXY); the limit's key. */
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

/** DEC-141: the longest stored path, in UTF-16 code units, and what marks a cut one. */
const MAX_PATH_LENGTH = 512;
const CUT_MARKER = '[cut]';

/** DEC-141: the first 512 characters and the marker; a surrogate pair is never split. */
function storedPath(path: string): string {
  if (path.length <= MAX_PATH_LENGTH) return path;
  const lastCode = path.charCodeAt(MAX_PATH_LENGTH - 1);
  const splitsPair = lastCode >= 0xd800 && lastCode <= 0xdbff;
  return `${path.slice(0, splitsPair ? MAX_PATH_LENGTH - 1 : MAX_PATH_LENGTH)}${CUT_MARKER}`;
}

export class RecordRefusedRequest {
  private readonly deps: RecordRefusedRequestDependencies;
  private readonly limiter = new RefusalLimiter();

  constructor(deps: RecordRefusedRequestDependencies) {
    this.deps = deps;
  }

  // RF-1009, RF-1109, DEC-141
  async execute(refused: RefusedRequest): Promise<void> {
    const at = this.deps.clock.now();
    const { write, ended } = this.limiter.admit(refused.ip, at.getTime());
    await this.writeCounts(ended, at);
    if (write) await this.writeRow(refused, at);
  }

  /** DEC-141: writes the count rows of the minutes that have ended (the one-minute task). */
  async flushEnded(): Promise<void> {
    const at = this.deps.clock.now();
    await this.writeCounts(this.limiter.takeEnded(at.getTime()), at);
  }

  /** DEC-141: writes every pending count row, ended or not (the server is closing). */
  async flushAll(): Promise<void> {
    await this.writeCounts(this.limiter.takeAll(), this.deps.clock.now());
  }

  private async writeRow(refused: RefusedRequest, at: Date): Promise<void> {
    const { actor, reason, method, ip } = refused;
    const path = storedPath(refused.path);
    await this.deps.auditLog.record({
      at,
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

  /** A count row that cannot be written is logged; it never fails the refusal being answered. */
  private async writeCounts(counts: readonly RefusalCount[], at: Date): Promise<void> {
    for (const count of counts) {
      try {
        await this.writeCount(count, at);
      } catch {
        await this.logCountFailure(count);
      }
    }
  }

  private async writeCount(refusals: RefusalCount, at: Date): Promise<void> {
    const { ip, count } = refusals;
    const windowStart = new Date(refusals.windowStartMs).toISOString();
    const detail = { reason: 'rate-limit', count, windowStart };
    await this.deps.auditLog.record({
      ...{ at, actorUserId: null, action: 'request.refused', targetType: 'route', targetId: null },
      ...{ ip, outcome: 'refused', detail },
    });
    await this.deps.logger.securityEvent(ERROR_CODES.rateLimited, {
      message: `Refused ${String(count)} more requests from ${ip} in the minute from ${windowStart}; past 30 a minute they are counted, not recorded one by one.`,
      data: { ...detail, ip },
    });
  }

  private async logCountFailure(refusals: RefusalCount): Promise<void> {
    const { ip, count } = refusals;
    try {
      await this.deps.logger.log({
        level: 'error',
        logger: 'security',
        message: 'Could not record the count of refused requests past the limit.',
        code: ERROR_CODES.databaseQueryFailed,
        data: { ip, count },
      });
    } catch {
      // Nothing else can report a failing logger; the refusal is still answered (RNF-003).
    }
  }
}
