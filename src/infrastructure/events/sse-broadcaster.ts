import type {
  RunEventFeed,
  RunEventListener,
  RunEventSink,
  RunScope,
} from '../../application/ports/run-events.js';
import { isRunEnded, type RunEvent } from '../../domain/runs/run-event.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskEvent } from './mask-event.js';

// Architecture section 7, RF-1006, RF-1105, RNF-003: the live events of runs for the pages that
// are connected. A page names its user and the run; an event reaches only the listeners of the
// run's owner, masked like the stored log. A listener that throws (a closed connection) is
// dropped and never stops the publisher or the other pages. A run's listeners are forgotten after
// `run.ended`, so a finished run holds nothing.
export class SseBroadcaster implements RunEventSink, RunEventFeed {
  private readonly masker: TextMasker;
  private readonly listeners = new Map<string, Set<RunEventListener>>();

  constructor(masker: TextMasker) {
    this.masker = masker;
  }

  /** The number of listeners connected now, across all runs. */
  get subscriberCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }

  subscribe(userId: string, runId: string, listener: RunEventListener): () => void {
    const key = keyOf(userId, runId);
    const set = this.listeners.get(key) ?? new Set<RunEventListener>();
    set.add(listener);
    this.listeners.set(key, set);
    return () => {
      set.delete(listener);
      if (set.size === 0 && this.listeners.get(key) === set) this.listeners.delete(key);
    };
  }

  publish(scope: RunScope, event: RunEvent): Promise<void> {
    try {
      const masked = maskEvent(event, this.masker);
      this.deliver(keyOf(scope.userId, scope.id), masked);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private deliver(key: string, event: RunEvent): void {
    const set = this.listeners.get(key);
    if (set === undefined) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        // A closed connection must not stop the other pages; its listener is dropped.
        set.delete(listener);
      }
    }
    if (isRunEnded(event) || set.size === 0) this.listeners.delete(key);
  }
}

function keyOf(userId: string, runId: string): string {
  return `${userId}/${runId}`;
}
