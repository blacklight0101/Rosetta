import type { Run } from '../../domain/runs/run.js';
import type { RunEvent } from '../../domain/runs/run-event.js';

// Architecture section 7 (`RunEventSink`), RF-1006: the ports behind the run events. A sink takes
// complete events (with their `seq`); the log refuses a gap and anything after `run.ended`. The
// history gives a late page the events it missed, and the feed gives it the live ones. All three
// name the run by its scope, so a sink needs no lookup to find the run's folder or its owner.

/** Where a run lives: its owner (workspace, SSE feed), project (folder) and ids. */
export type RunScope = Pick<Run, 'id' | 'userId' | 'projectId' | 'runKey'>;

export interface RunEventSink {
  /** Stores or forwards one event; rejects with RST-2105 when it does not follow the run's log. */
  publish(scope: RunScope, event: RunEvent): Promise<void>;
}

export interface RunEventHistory {
  /** The stored events with `seq` greater than `afterSeq`, in order; empty for a run without any. */
  read(scope: RunScope, afterSeq: number): Promise<readonly RunEvent[]>;
  /**
   * Hands the stored events with `seq` greater than `afterSeq` to `onBatch`, in order and in
   * batches, waiting for each call to settle before it reads on (so the receiver sets the pace);
   * stops with the receiver's error. Nothing is handed over for a run without events.
   */
  replay(
    scope: RunScope,
    afterSeq: number,
    onBatch: (batch: readonly RunEvent[]) => Promise<void>,
  ): Promise<void>;
  /** The `seq` of the last stored event; 0 for a run without any. */
  lastSeq(scope: RunScope): Promise<number>;
}

export type RunEventListener = (event: RunEvent) => void;

export interface RunEventFeed {
  /** Delivers the run's live events to the listener until the returned function is called. */
  subscribe(userId: string, runId: string, listener: RunEventListener): () => void;
}
