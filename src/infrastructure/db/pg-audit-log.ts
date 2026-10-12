import type {
  AuditEvent,
  AuditEventInput,
  AuditFilter,
  AuditLog,
} from '../../application/ports/audit-log.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskedDetailJson, toAuditEvent } from './audit-rows.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-1109: the audit trail in `audit_events`. The app role may
// only insert and select (data-model.md section 6). The detail is masked before it is stored.

const INSERT =
  'INSERT INTO audit_events (at, actor_user_id, action, target_type, target_id, ip, outcome, detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)';
const LIST =
  'SELECT id::text AS id, at, actor_user_id::text AS actor_user_id, action, target_type, target_id, ip, outcome, detail FROM audit_events WHERE at >= $1 AND ($2::uuid IS NULL OR actor_user_id = $2::uuid) AND ($3::text IS NULL OR action = $3::text) ORDER BY at DESC, id DESC';

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgAuditLog implements AuditLog {
  private readonly pool: DatabasePool;
  private readonly masker: TextMasker;

  constructor(pool: DatabasePool, masker: TextMasker) {
    this.pool = pool;
    this.masker = masker;
  }

  async record(event: AuditEventInput): Promise<void> {
    const values = [
      event.at,
      event.actorUserId,
      event.action,
      event.targetType,
      event.targetId,
      event.ip,
      event.outcome,
      maskedDetailJson(event.detail, this.masker),
    ];
    try {
      await this.pool.query(INSERT, values);
    } catch (error) {
      throw queryFailed(error);
    }
  }

  async list(filter: AuditFilter): Promise<readonly AuditEvent[]> {
    const values = [filter.since, filter.actorUserId ?? null, filter.action ?? null];
    let rows: unknown[];
    try {
      rows = (await this.pool.query<Record<string, unknown>>(LIST, values)).rows;
    } catch (error) {
      throw queryFailed(error);
    }
    return rows.map(toAuditEvent);
  }
}
