import type {
  RunEventHistory,
  RunEventSink,
  RunScope,
} from '../../application/ports/run-events.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import { advance, assertNext, emptyTail, type EventTail } from './event-order.js';

// Architecture section 7, RF-1006: the events of runs in memory, for unit tests. Passes the same
// contract suite as JsonlEventLog: no gaps, `run.ended` last, reads after a sequence number.
export class MemoryEventSink implements RunEventSink, RunEventHistory {
  private readonly events = new Map<string, RunEvent[]>();
  private readonly tails = new Map<string, EventTail>();

  publish(scope: RunScope, event: RunEvent): Promise<void> {
    try {
      assertNext(this.tails.get(scope.id) ?? emptyTail, scope, event);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.tails.set(scope.id, advance(event));
    this.events.set(scope.id, [...(this.events.get(scope.id) ?? []), event]);
    return Promise.resolve();
  }

  read(scope: RunScope, afterSeq: number): Promise<readonly RunEvent[]> {
    const stored = this.events.get(scope.id) ?? [];
    return Promise.resolve(stored.filter((event) => event.seq > afterSeq));
  }

  lastSeq(scope: RunScope): Promise<number> {
    return Promise.resolve(this.tails.get(scope.id)?.lastSeq ?? 0);
  }
}
