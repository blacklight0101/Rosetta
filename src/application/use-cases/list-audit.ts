import type { Actor } from '../../domain/accounts/actor.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditEvent, AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';

// RF-1109: the audit view of the administration page lists the events of the last 30 days, newest
// first, optionally of one user and one action. An answer holds at most 500 events, the newest;
// `truncated` says that older ones in the window were left out (narrow the filter to see them).

export interface ListAuditRequest {
  readonly actor: Actor;
  /** Only the events this user did. */
  readonly userId?: string | undefined;
  /** Only events of this action, for example `auth.sign_in`. */
  readonly action?: string | undefined;
}

export interface AuditPage {
  /** The start of the 30-day window. */
  readonly since: EpochMs;
  readonly events: readonly AuditEvent[];
  readonly truncated: boolean;
}

export interface ListAuditDependencies {
  readonly auditLog: AuditLog;
  readonly clock: Clock;
}

const WINDOW_MS = 30 * 86_400_000;
const MAX_EVENTS = 500;

export class ListAudit {
  private readonly deps: ListAuditDependencies;

  constructor(deps: ListAuditDependencies) {
    this.deps = deps;
  }

  // RF-1109
  async execute(
    request: ListAuditRequest,
  ): Promise<Result<AuditPage, typeof ERROR_CODES.notAllowed>> {
    if (request.actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
    const since = this.deps.clock.now().getTime() - WINDOW_MS;
    const listed = await this.deps.auditLog.list({
      since,
      ...(request.userId === undefined ? {} : { actorUserId: request.userId }),
      ...(request.action === undefined ? {} : { action: request.action }),
      limit: MAX_EVENTS + 1,
    });
    return ok({
      since,
      events: listed.slice(0, MAX_EVENTS),
      truncated: listed.length > MAX_EVENTS,
    });
  }
}
