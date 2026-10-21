import type { RunEvent } from '../../api/run-events.js';
import { retryStartedData } from './event-data.js';
import type { RunState } from './run-state.js';

// RF-208, Q-43, RF-1002: what the `retry.started` event changes: the run being retried and the cards
// it starts from. An event that does not fit changes nothing. A resumed retry publishes it again.

// RF-208
export function onRetryStarted(state: RunState, event: RunEvent): RunState {
  const parsed = retryStartedData.safeParse(event.data);
  if (!parsed.success) return state;
  const { parentRunId, parentRunKey, areas, seeded } = parsed.data;
  return { ...state, retry: { parentRunId, parentRunKey, areas, seeded } };
}
