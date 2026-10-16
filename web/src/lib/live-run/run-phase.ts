import type { RunRow } from '../../api/run-schemas.js';
import type { RunState } from './run-state.js';

// RF-1108, RF-003: where a run is, from what the page knows: the events say when it started and
// ended; the run row says so for a run whose events have not arrived yet (a queued run has none).

export type RunPhase =
  | { readonly kind: 'queued' }
  | { readonly kind: 'running' }
  | { readonly kind: 'ended'; readonly endState: string };

// RF-1108
export function phaseOf(row: RunRow, state: RunState): RunPhase {
  if (state.ended !== undefined) return { kind: 'ended', endState: state.ended.endState };
  // A run the row calls ended stays ended while its events replay: the page never goes back to the
  // running mode (RF-1015).
  if (row.queueState === 'Ended') return { kind: 'ended', endState: row.endState ?? 'Interrupted' };
  if (state.startedAt !== undefined) return { kind: 'running' };
  if (row.queueState === 'Queued') return { kind: 'queued' };
  return { kind: 'running' };
}
