import type { Actor } from '../../domain/accounts/actor.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditEvent, AuditLog, AuditOutcome } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';

// RF-1109: the audit view of the administration page lists the events of the last 30 days, newest
// first, optionally of one user, one action and one outcome, and optionally of the last 24 hours or
// 7 days only (P1-107, AdminAudit.dc.html). An answer holds at most 500 events, the newest;
// `truncated` says that older ones in the window were left out (narrow the filter to see them).

export interface ListAuditRequest {
  readonly actor: Actor;
  /** Only the events this user did. */
  readonly userId?: string | undefined;
  /** Only events of this action, for example `auth.sign_in`. */
  readonly action?: string | undefined;
  /** Only events of this outcome. */
  readonly outcome?: AuditOutcome | undefined;
  /** The window in days, counted back from now; 30 when left out. */
  readonly days?: AuditPeriodDays | undefined;
}

/** The periods the audit view offers: the last 24 hours, 7 days or 30 days. */
export const AUDIT_PERIOD_DAYS = [1, 7, 30] as const;

export type AuditPeriodDays = (typeof AUDIT_PERIOD_DAYS)[number];

export interface AuditPage {
  /** The start of the window. */
  readonly since: EpochMs;
  readonly events: readonly AuditEvent[];
  readonly truncated: boolean;
}

export interface ListAuditDependencies {
  readonly auditLog: AuditLog;
  readonly clock: Clock;
}

const DAY_MS = 86_400_000;
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
    const since = this.deps.clock.now().getTime() - (request.days ?? 30) * DAY_MS;
    const listed = await this.deps.auditLog.list({
      since,
      ...(request.userId === undefined ? {} : { actorUserId: request.userId }),
      ...(request.action === undefined ? {} : { action: request.action }),
      ...(request.outcome === undefined ? {} : { outcome: request.outcome }),
      limit: MAX_EVENTS + 1,
    });
    return ok({
      since,
      events: listed.slice(0, MAX_EVENTS),
      truncated: listed.length > MAX_EVENTS,
    });
  }
}
