import type {
  AuditEvent,
  AuditEventInput,
  AuditFilter,
  AuditLog,
} from '../../application/ports/audit-log.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskedDetailJson, toAuditEvent } from './audit-rows.js';

// Architecture section 7, RF-1109: the audit trail in memory, for unit tests. It masks and stores
// the detail exactly as PgAuditLog does and passes the same contract suite.

interface StoredEvent {
  readonly sequence: number;
  readonly row: Record<string, unknown>;
  readonly event: AuditEventInput;
}

function parseJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value;
}

export class MemoryAuditLog implements AuditLog {
  private readonly masker: TextMasker;
  private readonly events: StoredEvent[] = [];

  constructor(masker: TextMasker) {
    this.masker = masker;
  }

  record(event: AuditEventInput): Promise<void> {
    const sequence = this.events.length + 1;
    const row = {
      id: String(sequence),
      at: event.at,
      actor_user_id: event.actorUserId,
      action: event.action,
      target_type: event.targetType,
      target_id: event.targetId,
      ip: event.ip,
      outcome: event.outcome,
      detail: parseJson(maskedDetailJson(event.detail, this.masker)),
    };
    this.events.push({ sequence, row, event });
    return Promise.resolve();
  }

  list(filter: AuditFilter): Promise<readonly AuditEvent[]> {
    const matching = this.events.filter(
      ({ event }) =>
        event.at.getTime() >= filter.since.getTime() &&
        (filter.actorUserId === undefined || event.actorUserId === filter.actorUserId) &&
        (filter.action === undefined || event.action === filter.action),
    );
    const newestFirst = matching.sort(
      (left, right) =>
        right.event.at.getTime() - left.event.at.getTime() || right.sequence - left.sequence,
    );
    return Promise.resolve(newestFirst.map((stored) => toAuditEvent(stored.row)));
  }
}
