import type { LogValue } from './logger.js';

// Architecture section 7, RF-1109: the security audit trail. Rows are only inserted and read,
// never changed (data-model.md section 6); the detail is masked before it is stored, so no row
// holds a password, key or session id.

type AuditOutcome = 'ok' | 'refused' | 'failed';

/** JSON-safe detail of an event. */
export type AuditDetail = Readonly<Record<string, LogValue>>;

export interface AuditEventInput {
  readonly at: Date;
  /** Null for anonymous sign-in attempts. */
  readonly actorUserId: string | null;
  /** For example `auth.sign_in`, `auth.locked`, `user.created` (data-model.md section 4). */
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly ip: string;
  readonly outcome: AuditOutcome;
  readonly detail: AuditDetail;
}

export interface AuditEvent extends AuditEventInput {
  readonly id: string;
}

export interface AuditFilter {
  readonly since: Date;
  readonly actorUserId?: string;
  readonly action?: string;
}

export interface AuditLog {
  record(event: AuditEventInput): Promise<void>;
  /** Events at or after `since`, newest first, optionally of one actor and one action. */
  list(filter: AuditFilter): Promise<readonly AuditEvent[]>;
}
