import type { Logger } from '../ports/logger.js';

// RF-206, RF-208, Q-55, RF-1002: what became of a reader's answer, as one line of the application
// log and one run event. It names the reason only, never the answer or any card text, so a run
// page and `events.jsonl` can explain a retry without holding model output.

/** `refused`: asked to read first or more; `accepted`: let through for lack of room; `kept`: a refused answer read as final because the task ended; `cut`: complete cards kept from a cut-off answer. */
export interface AnswerNote {
  readonly outcome: 'refused' | 'accepted' | 'kept' | 'cut';
  /** For example `not-read`, `read-little`, `no-room`, `context-limit`, `max-turns`. */
  readonly reason: string;
}

/** Where a note goes. */
export interface NoteSink {
  readonly logger: Logger;
  readonly runId: string;
  readonly agentTaskId: string;
  readonly onNote?: (note: AnswerNote) => Promise<void>;
}

export async function recordNote(sink: NoteSink, note: AnswerNote): Promise<void> {
  await sink.logger.log({
    level: 'info',
    logger: 'agent',
    message: `An agent answer was ${note.outcome}.`,
    runId: sink.runId,
    agentTaskId: sink.agentTaskId,
    data: { outcome: note.outcome, reason: note.reason },
  });
  await sink.onNote?.(note);
}
