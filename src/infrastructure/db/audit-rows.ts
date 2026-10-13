import { z } from 'zod';
import type {
  AuditDetail,
  AuditEvent,
  AuditEventInput,
  AuditFilter,
} from '../../application/ports/audit-log.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { auditSafeDetail, withoutNul } from './audit-text.js';

// RF-1109, RNF-003: what the audit adapters share. The detail is masked (P1-04) and stored as JSON
// text; when the masking fails the detail is withheld whole (fail closed, DEC-57). Rows read back
// are parsed with zod, never cast.

const WITHHELD_DETAIL = JSON.stringify({ withheld: 'secret masking failed' });

/** The detail as masked JSON text, or the withheld marker when masking fails. */
// RF-1109
export function maskedDetailJson(detail: AuditDetail, masker: TextMasker): string {
  try {
    return JSON.stringify(maskDeep(auditSafeDetail(detail), masker));
  } catch {
    return WITHHELD_DETAIL;
  }
}

/** The text columns of an event as they are stored: every NUL replaced (P1-77). */
// RF-1109
export function storedAuditText(
  event: AuditEventInput,
): Pick<AuditEventInput, 'action' | 'targetType' | 'targetId' | 'ip'> {
  return {
    action: withoutNul(event.action),
    targetType: event.targetType === null ? null : withoutNul(event.targetType),
    targetId: event.targetId === null ? null : withoutNul(event.targetId),
    ip: withoutNul(event.ip),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The filter as both adapters compare it with the stored rows (P1-101): the user id in lower case,
 * as PostgreSQL prints a uuid, and every NUL in the action replaced, as in a stored action. Null
 * when the user id is not a UUID, which names no user.
 */
// RF-1109
export function storedAuditFilter(filter: AuditFilter): AuditFilter | null {
  const { actorUserId, action } = filter;
  if (actorUserId !== undefined && !UUID.test(actorUserId)) return null;
  return {
    ...filter,
    ...(actorUserId === undefined ? {} : { actorUserId: actorUserId.toLowerCase() }),
    ...(action === undefined ? {} : { action: withoutNul(action) }),
  };
}

const detailSchema = z.record(z.string(), z.json());

/** A stored row, with `pg` column names. */
const auditRowSchema = z.object({
  id: z.string(),
  at: z.date(),
  actor_user_id: z.string().nullable(),
  action: z.string(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  ip: z.string(),
  outcome: z.enum(['ok', 'refused', 'failed']),
  detail: detailSchema,
});

/** A parsed row as the port's event. */
// RF-1109
export function toAuditEvent(row: unknown): AuditEvent {
  const parsed = auditRowSchema.parse(row);
  return {
    id: parsed.id,
    at: parsed.at,
    actorUserId: parsed.actor_user_id,
    action: parsed.action,
    targetType: parsed.target_type,
    targetId: parsed.target_id,
    ip: parsed.ip,
    outcome: parsed.outcome,
    detail: parsed.detail,
  };
}
