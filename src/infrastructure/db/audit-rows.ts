import { z } from 'zod';
import type { AuditDetail, AuditEvent } from '../../application/ports/audit-log.js';
import { maskDeep } from '../guards/mask-deep.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-1109, RNF-003: what the audit adapters share. The detail is masked (P1-04) and stored as JSON
// text; when the masking fails the detail is withheld whole (fail closed, DEC-57). Rows read back
// are parsed with zod, never cast.

const WITHHELD_DETAIL = JSON.stringify({ withheld: 'secret masking failed' });

/** The detail as masked JSON text, or the withheld marker when masking fails. */
// RF-1109
export function maskedDetailJson(detail: AuditDetail, masker: TextMasker): string {
  try {
    return JSON.stringify(maskDeep(detail, masker));
  } catch {
    return WITHHELD_DETAIL;
  }
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
