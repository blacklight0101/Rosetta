import type { RunExecution } from '../ports/run-executor.js';
import type { ReadersStop } from './reader-room.js';

// RF-429, RF-1002, P5-20: the one event that tells the run page and the event log that the readers
// stopped, and why: to leave room to judge the claims written, or because their own share had no
// room for another call. The page words it (`web/src/lib/live-run/log-text.ts`).

// RF-429
export async function announceReadersStopped(
  execution: Pick<RunExecution, 'events'>,
  reason: ReadersStop,
  claimsWaiting: number,
): Promise<void> {
  await execution.events.emit('budget.readersStopped', { reason, claimsWaiting });
}
