import type {
  AuditEvent,
  AuditEventInput,
  AuditFilter,
  AuditLog,
} from '../../application/ports/audit-log.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  maskedDetailJson,
  storedAuditFilter,
  storedAuditText,
  toAuditEvent,
} from './audit-rows.js';

// Architecture section 7, RF-1109: the audit trail in memory, for unit tests. It masks and stores
// the detail exactly as PgAuditLog does and passes the same contract suite.

interface StoredEvent {
  readonly sequence: number;
  readonly row: Record<string, unknown>;
  readonly event: AuditEventInput;
  /** The action as stored, which the filter compares. */
  readonly action: string;
}

function parseJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value;
}

export class MemoryAuditLog implements AuditLog {
  private readonly masker: TextMasker;
  private readonly events: StoredEvent[] = [];
  private recorded = 0;

  constructor(masker: TextMasker) {
    this.masker = masker;
  }

  record(event: AuditEventInput): Promise<void> {
    this.recorded += 1;
    const sequence = this.recorded;
    const text = storedAuditText(event);
    const row = {
      id: String(sequence),
      at: event.at,
      actor_user_id: event.actorUserId,
      action: text.action,
      target_type: text.targetType,
      target_id: text.targetId,
      ip: text.ip,
      outcome: event.outcome,
      detail: parseJson(maskedDetailJson(event.detail, this.masker)),
    };
    this.events.push({ sequence, row, event, action: text.action });
    return Promise.resolve();
  }

  list(filter: AuditFilter): Promise<readonly AuditEvent[]> {
    const stored = storedAuditFilter(filter);
    if (stored === null) return Promise.resolve([]);
    const matching = this.events.filter(
      ({ event, action }) =>
        event.at.getTime() >= stored.since &&
        (stored.actorUserId === undefined ||
          event.actorUserId?.toLowerCase() === stored.actorUserId) &&
        (stored.action === undefined || action === stored.action) &&
        (stored.outcome === undefined || event.outcome === stored.outcome),
    );
    const newestFirst = matching.sort(
      (left, right) =>
        right.event.at.getTime() - left.event.at.getTime() || right.sequence - left.sequence,
    );
    const limited = newestFirst.slice(0, stored.limit ?? newestFirst.length);
    return Promise.resolve(limited.map((stored) => toAuditEvent(stored.row)));
  }

  /** For MemoryAuditRetention only (the port never deletes): drops the events before `cutOff`. */
  removeBefore(cutOff: Date): number {
    const kept = this.events.filter(({ event }) => event.at.getTime() >= cutOff.getTime());
    const removed = this.events.length - kept.length;
    this.events.splice(0, this.events.length, ...kept);
    return removed;
  }
}
