import type { RunScope } from '../../application/ports/run-events.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isRunEnded, type RunEvent } from '../../domain/runs/run-event.js';

// Data-model.md section 5, RF-1006: the rules every event store enforces. `seq` counts from 1
// without gaps, an event names its own run, and `run.ended` is the last event until the run is
// resumed: only `run.started` may follow it, or the `run.ended` of a resumed run cancelled while it
// waited in the queue, which wrote no `run.started` in its new life (RF-006, P9-05).

/** What a store knows of a run's events. */
export interface EventTail {
  readonly lastSeq: number;
  readonly ended: boolean;
}

const RUN_STARTED = 'run.started';
const QUEUE_CANCEL = 'QueueCancel';

export const emptyTail: EventTail = { lastSeq: 0, ended: false };

function refused(detail: string): RosettaError {
  return new RosettaError(ERROR_CODES.runEventRefused, `A run event was refused: ${detail}.`);
}

/**
 * P9-05: a resume writes no event while the run waits, so the cancel of that wait is the only
 * `run.ended` that opens no life of its own; it is the end of the life the resume began. Any other
 * `run.ended` after a `run.ended` is a second end within one life.
 */
function endsQueuedLife(event: RunEvent): boolean {
  return isRunEnded(event) && event.data['endReason'] === QUEUE_CANCEL;
}

/** Throws RST-2105 unless the event may follow the tail in the scope's log. */
// RF-1006
export function assertNext(tail: EventTail, scope: RunScope, event: RunEvent): void {
  if (event.runId !== scope.runKey) throw refused('it names another run');
  if (tail.ended && event.type !== RUN_STARTED && !endsQueuedLife(event))
    throw refused('the run has already ended');
  if (event.seq !== tail.lastSeq + 1) {
    throw refused(`expected sequence number ${String(tail.lastSeq + 1)}, got ${String(event.seq)}`);
  }
}

/** The tail after the event was stored. */
export function advance(event: RunEvent): EventTail {
  return { lastSeq: event.seq, ended: isRunEnded(event) };
}

/** How many stored events a replay hands to the receiver at a time. */
export const REPLAY_BATCH_SIZE = 100;
